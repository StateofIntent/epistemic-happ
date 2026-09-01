#!/usr/bin/env node
// ============================================================================
// domains/bootstrap.mjs — founds a new domain Membrane from a template file.
//
// Usage:
//   node bootstrap.mjs <template.json> [--admin ws://localhost:8889]
//                                       [--app ws://localhost:8888]
//                                       [--app-id epistemic-resonance-happ]
//
// Reads a domain template (see domains/README.md for the schema, and
// domains/climate.json / domains/nutrition.json for two worked
// examples), then makes real zome calls, in order, against a running
// conductor:
//   1. publish_constitution — the founding agent's own promises
//   2. create_membrane — referencing that Constitution's ActionHash
//   3. create_critique_species — once per species in the template's
//      list, in order, resolving each species' "parent" name to the
//      EntryHash of a species created earlier in this same run
//
// Connection flow mirrors bridge/src/index.ts's HolochainClient#connect
// and mobile-ui/src/holochain.ts exactly (issue an app auth token,
// authorize zome-call signing credentials per cell) — see either for
// the fuller account of why each step is there.
// ============================================================================
import { readFileSync } from 'node:fs';
import { AdminWebsocket, AppWebsocket, CellType } from '@holochain/client';
import { decode } from '@msgpack/msgpack';

function parseArgs(argv) {
  const args = { admin: 'ws://localhost:8889', app: 'ws://localhost:8888', appId: 'epistemic-resonance-happ' };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--admin') args.admin = argv[++i];
    else if (a === '--app') args.app = argv[++i];
    else if (a === '--app-id') args.appId = argv[++i];
    else positional.push(a);
  }
  if (positional.length !== 1) {
    console.error('Usage: node bootstrap.mjs <template.json> [--admin URL] [--app URL] [--app-id ID]');
    process.exit(1);
  }
  args.templatePath = positional[0];
  return args;
}

/** Strips every `_`-prefixed key (this template format's own comment
 * convention — JSON has no real comment syntax; see template.json's own
 * header for why these exist and that they're not part of the real
 * schema). Shallow is enough: comments only ever appear as top-level
 * keys in this format. */
function stripComments(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith('_')) out[k] = v;
  }
  return out;
}

function nowMicros() {
  return Date.now() * 1000;
}

async function connect({ admin: adminUrl, app: appUrl, appId }) {
  const wsClientOptions = { origin: 'epistemic-domain-bootstrap' };
  const admin = await AdminWebsocket.connect({ url: new URL(adminUrl), wsClientOptions });
  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: appId });
  const app = await AppWebsocket.connect({ url: new URL(appUrl), token, wsClientOptions });
  const info = await app.appInfo();
  const cellIds = [];
  for (const roleCells of Object.values(info.cell_info)) {
    for (const cell of roleCells) {
      if (CellType.Provisioned in cell) cellIds.push(cell[CellType.Provisioned].cell_id);
      else if (CellType.Cloned in cell) cellIds.push(cell[CellType.Cloned].cell_id);
    }
  }
  if (cellIds.length === 0) throw new Error(`App "${appId}" has no provisioned or cloned cells.`);
  for (const cellId of cellIds) await admin.authorizeSigningCredentials(cellId);
  const myAgent = cellIds[0][1];
  const callZome = (fn, payload) =>
    app.callZome({ role_name: 'epistemic', zome_name: 'epistemic_coordinator', fn_name: fn, payload });
  return { myAgent, callZome };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const template = stripComments(JSON.parse(readFileSync(args.templatePath, 'utf8')));

  for (const field of ['domain', 'description', 'promises', 'required_promises', 'critique_species']) {
    if (!(field in template)) {
      console.error(`Template is missing required field "${field}" — see domains/README.md.`);
      process.exit(1);
    }
  }

  console.log(`Connecting to conductor (admin=${args.admin}, app=${args.app}, app-id=${args.appId}) ...`);
  const { myAgent, callZome } = await connect(args);
  console.log(`Connected as agent ${Buffer.from(myAgent).toString('base64')}\n`);

  console.log(`Publishing Constitution for domain "${template.domain}" ...`);
  const constitutionHash = await callZome('publish_constitution', {
    agent: myAgent,
    promises: template.promises,
    conditions: template.conditions ?? [],
    published_at: nowMicros(),
    expires_at: null,
  });
  console.log(`  Constitution: ${Buffer.from(constitutionHash).toString('base64')}`);

  console.log(`Creating Membrane "${template.domain}" ...`);
  const membraneHash = await callZome('create_membrane', {
    domain: template.domain,
    description: template.description,
    required_promises: template.required_promises,
    validation_rules_hash: null,
    creator: myAgent,
    created_at: nowMicros(),
    constitution: constitutionHash,
  });
  console.log(`  Membrane: ${Buffer.from(membraneHash).toString('base64')}\n`);

  console.log(`Creating ${template.critique_species.length} CritiqueSpecies ...`);
  // name -> EntryHash, populated as each species is created, so a later
  // entry's "parent" (a name string in the template) can be resolved to
  // the real hash create_critique_species needs.
  const speciesEntryHashByName = new Map();

  for (const species of template.critique_species) {
    let parentHash = null;
    if (species.parent) {
      parentHash = speciesEntryHashByName.get(species.parent);
      if (!parentHash) {
        throw new Error(
          `CritiqueSpecies "${species.name}" names parent "${species.parent}", which hasn't been ` +
          `created yet in this template — a parent must appear earlier in the critique_species list.`
        );
      }
    }

    const actionHash = await callZome('create_critique_species', {
      name: species.name,
      parent_species: parentHash,
      required_evidence: species.required_evidence ?? [],
      proposer: myAgent,
      created_at: nowMicros(),
    });

    // create_critique_species returns the entry's ActionHash, but
    // parent_species (and this map, for any children of THIS species)
    // needs its EntryHash — the same getter/creator hash distinction
    // this codebase's own README documents throughout. Recovered the
    // same way the live-verification harnesses elsewhere in this repo
    // do: fetch it back and decode.
    const allSpecies = await callZome('get_all_critique_species', undefined);
    const match = allSpecies.find((record) => {
      const decoded = decode(record.entry.Present.entry);
      return decoded.name === species.name && decoded.proposer.every((b, i) => b === myAgent[i]);
    });
    if (!match) throw new Error(`Could not find just-created CritiqueSpecies "${species.name}" via get_all_critique_species.`);
    const entryHash = match.signed_action.hashed.content.entry_hash;
    speciesEntryHashByName.set(species.name, entryHash);

    console.log(
      `  ${species.name}${species.parent ? ` (parent: ${species.parent})` : ''}: ` +
      `${Buffer.from(actionHash).toString('base64')}`
    );
  }

  console.log(`\nDone. Domain "${template.domain}" is founded.`);
  console.log(`Membrane hash (for get_discourse_health, get_cross_domain_critiques, etc.): ${Buffer.from(membraneHash).toString('base64')}`);
}

// The open AdminWebsocket/AppWebsocket connections keep Node's event
// loop alive indefinitely — confirmed directly (the process didn't
// exit on its own after a real, fully-successful run against a live
// conductor). Neither client is exposed by connect() for an explicit
// close() call, so the simplest correct fix, matching how a one-shot
// CLI tool should behave, is an explicit exit once the work is done.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err.message ?? err);
    process.exit(1);
  });
