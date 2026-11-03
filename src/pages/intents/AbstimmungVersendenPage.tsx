/**
 * Abstimmung freigeben — 3-Schritt-Wizard.
 * Steps: 1) Entwurf wählen → 2) Prüfen (Terminvorschläge, Teilnehmer, Frist) → 3) Bestätigen & versenden.
 * Reads: terminabstimmungen, terminvorschlaege, teilnehmer.
 * Writes: terminabstimmungen (status), teilnehmer (einladungsstatus, einladung_versendet_am) — via useAbstimmungVersendenFlow.
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IconCheck, IconAlertTriangle } from '@tabler/icons-react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldDate, fieldRef, refFilter, useRecordCount } from '@/lib/journey';
import { useAbstimmungVersendenFlow } from '@/lib/journey/flows/AbstimmungVersenden';
import { format, parseISO } from 'date-fns';
import { tx } from '@/i18n';

export default function AbstimmungVersendenPage() {
  const [step, setStep] = useState(1);
  const flow = useAbstimmungVersendenFlow({
    steps: { terminabstimmungen: 1, teilnehmer: 2 },
    items: {
      terminabstimmungen: r => ({
        id: r.id,
        title: fieldText(r, 'titel'),
        subtitle: fieldDate(r, 'antwortfrist')
          ? tx`Antwortfrist: ${format(parseISO(fieldDate(r, 'antwortfrist') as string), 'dd.MM.yyyy HH:mm')}`
          : undefined,
      }),
      teilnehmer: (r, ctx) => ({
        id: r.id,
        title: `${fieldText(r, 'vorname')} ${fieldText(r, 'nachname')}`.trim(),
        subtitle: [fieldText(r, 'email'), ctx.ref('terminabstimmung')].filter(Boolean).join(' · '),
      }),
    },
  });

  const abstimmungId = flow.targets.terminabstimmungen.selectedId;
  const abstimmung = flow.targets.terminabstimmungen.record;

  const vorschlaege = useRecordCount(flow.port, 'terminvorschlaege', {
    filter: abstimmungId ? refFilter('terminabstimmung', abstimmungId) : undefined,
    where: r => fieldRef(r, 'terminabstimmung') === abstimmungId,
    enabled: Boolean(abstimmungId),
  });
  const teilnehmerAnzahl = useRecordCount(flow.port, 'teilnehmer', {
    filter: abstimmungId ? refFilter('terminabstimmung', abstimmungId) : undefined,
    where: r => fieldRef(r, 'terminabstimmung') === abstimmungId,
    enabled: Boolean(abstimmungId),
  });

  const fristIso = abstimmung ? fieldDate(abstimmung, 'antwortfrist') : null;
  const fristVorbei = fristIso ? parseISO(fristIso).getTime() < Date.now() : false;
  const keineVorschlaege = vorschlaege.count === 0;
  const keineTeilnehmer = teilnehmerAnzahl.count === 0;

  const checkNext = (): boolean | string => {
    if (fristVorbei) return tx('Die Antwortfrist darf nicht in der Vergangenheit liegen.');
    if (keineVorschlaege) return tx('Es braucht mindestens einen Terminvorschlag.');
    if (keineTeilnehmer) return tx('Es braucht mindestens einen Teilnehmer.');
    return flow.validateStep(2);
  };

  const checks = [
    {
      key: 'vorschlaege',
      ok: vorschlaege.count !== null && vorschlaege.count > 0,
      text: vorschlaege.count === null ? tx('Terminvorschläge werden gezählt …') : tx`${vorschlaege.count} Terminvorschläge vorhanden`,
    },
    {
      key: 'teilnehmer',
      ok: teilnehmerAnzahl.count !== null && teilnehmerAnzahl.count > 0,
      text: teilnehmerAnzahl.count === null ? tx('Teilnehmer werden gezählt …') : tx`${teilnehmerAnzahl.count} Teilnehmer vorhanden`,
    },
    {
      key: 'frist',
      ok: !fristVorbei && Boolean(fristIso),
      text: fristIso
        ? (fristVorbei
          ? tx`Antwortfrist ist seit ${format(parseISO(fristIso), 'dd.MM.yyyy HH:mm')} vorbei`
          : tx`Antwortfrist bis ${format(parseISO(fristIso), 'dd.MM.yyyy HH:mm')}`)
        : tx('Keine Antwortfrist gesetzt'),
    },
  ];

  return (
    <IntentWizardShell
      title={tx('Abstimmung freigeben')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Gib einen Entwurf zur Abstimmung frei und markiere die Einladung als versendet.'),
        needs: [tx('Einen Entwurf mit Terminvorschlägen'), tx('Mindestens einen Teilnehmer')],
      }}
    >
      <WizardStep label={tx('Entwurf')} description={tx('Welchen Entwurf möchtest du freigeben?')}>
        <EntitySelectStep
          {...flow.picks.terminabstimmungen.select}
          {...flow.pick('terminabstimmungen')}
          searchPlaceholder={tx('Titel suchen …')}
          emptyText={tx('Es gibt keinen Entwurf, der freigegeben werden könnte.')}
        />
      </WizardStep>

      <WizardStep label={tx('Prüfen')} description={tx('Alles da? Dann wähle den Teilnehmer, dessen Einladung versendet wird.')}>
        {abstimmungId ? (
          <div className="space-y-4">
            <ul className="space-y-2 rounded-2xl border bg-card p-4">
              {checks.map(c => (
                <li key={c.key} className="flex items-center gap-2 text-sm">
                  {c.ok
                    ? <IconCheck size={16} className="shrink-0 text-emerald-600" />
                    : <IconAlertTriangle size={16} className="shrink-0 text-amber-600" />}
                  <span className="min-w-0">{c.text}</span>
                </li>
              ))}
            </ul>
            <EntitySelectStep
              {...flow.picks.teilnehmer.select}
              {...flow.pick('teilnehmer')}
              searchPlaceholder={tx('Name oder E-Mail …')}
            />
            <StepNav
              onBack={() => setStep(1)}
              onNext={checkNext}
              nextStepLabel={tx('Prüfen & versenden')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
          </StepNav>
        )}
      </WizardStep>

      <WizardStep label={tx('Versenden')} description={tx('Prüfe die Angaben und gib die Abstimmung frei.')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            confirmLabel={tx('Abstimmung freigeben')}
            whatHappensNext={tx('Der Status wechselt auf „Versendet“, die Einladung des Teilnehmers wird als versendet markiert.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          facts={[
            { label: tx('Abstimmung'), value: abstimmung ? fieldText(abstimmung, 'titel') : '—' },
            { label: tx('Status'), value: tx('Versendet') },
          ]}
          next={[
            { label: tx('Termin festlegen'), href: '#/intents/termin-festlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Sobald die Antworten da sind, kannst du den Termin verbindlich festlegen.')}
        />
      )}
    </IntentWizardShell>
  );
}
