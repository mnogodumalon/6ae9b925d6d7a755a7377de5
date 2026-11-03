// Auto-generated. Per-entity form-enhancements config for "Terminabstimmungen".
// Written by the backend form polish (app/services/form_polish.py) from the
// generator's manifest; scripts/parse-formulas.mjs expands the formula strings.
// Schema: see ./types.ts.

import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ["abstimmungsnummer", "titel", {"row": ["organisator_vorname", "organisator_nachname"]}, "organisator_email", {"row": ["standarddauer_minuten", "zeitzone"], "cols": "1fr 1fr"}, "antwortfrist", "entscheidungsregel", "status", "ort", "meeting_link", {"row": ["festgelegt_am", "abgesagt_am"], "cols": "1fr 1fr"}, "kalender_option", "einladungen_extern_senden", "externe_kalender_id", "aufbewahrung_bis", "beschreibung", "entscheidungskommentar"],
  defaults: {
    'standarddauer_minuten': { kind: 'literal', value: 60 },
    'antwortfrist': { kind: 'todayOffset', days: 7, withTime: true },
    'status': { kind: 'lookup', key: 'entwurf', label: 'Entwurf' },
    'zeitzone': { kind: 'lookup', key: 'europe_berlin', label: 'Europe/Berlin' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
