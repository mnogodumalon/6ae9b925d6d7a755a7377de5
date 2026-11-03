/**
 * Abstimmung anlegen — 4-Schritt-Wizard für eine Terminabstimmung als Entwurf.
 * Steps: 1) Grunddaten → 2) Terminvorschläge (Liste) → 3) Teilnehmer (Liste) → 4) Prüfen & als Entwurf speichern.
 * Reads: nichts (alles wird neu erfasst). Writes: terminabstimmungen, terminvorschlaege, teilnehmer
 * (über useAbstimmungAnlegenFlow, ein Plan-Schritt je Listeneintrag).
 * Composes: IntentWizardShell, Bound, ListEntries, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { Bound } from '@/components/blocks/Bound';
import { ListEntries } from '@/components/blocks/ListEntries';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { useAbstimmungAnlegenFlow } from '@/lib/journey/flows/AbstimmungAnlegen';
import { tx } from '@/i18n';

/** Langer, zufälliger, nicht erratbarer Wert (2 × UUID ohne Bindestriche). */
function randomToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
}

export default function AbstimmungAnlegenPage() {
  const [step, setStep] = useState(1);
  const flow = useAbstimmungAnlegenFlow({
    steps: {
      titel: 1, beschreibung: 1, organisator_vorname: 1, organisator_nachname: 1, organisator_email: 1,
      standarddauer_minuten: 1, ort: 1, meeting_link: 1, zeitzone: 1, antwortfrist: 1, entscheidungsregel: 1,
      start: 2, ende: 2, ort_abweichend: 2, meeting_link_abweichend: 2, reihenfolge: 2,
      vorname: 3, nachname: 3, email: 3, organisation: 3, rolle: 3,
    },
    compute: { zugriffstoken: () => randomToken() },
  });

  const vorschlaege = flow.forms.terminvorschlaege;
  const teilnehmer = flow.forms.teilnehmer;

  // Prüfung: Ende liegt nach dem Start (Editor und bereits aufgenommene Einträge)
  const checkVorschlaege = (): boolean | string => {
    const start = vorschlaege.get('start');
    const ende = vorschlaege.get('ende');
    if (typeof start === 'string' && typeof ende === 'string' && start && ende && ende <= start) {
      return tx('Das Ende muss nach dem Start liegen.');
    }
    return flow.validateStep(2);
  };

  // Prüfung: E-Mail je Abstimmung nur einmal
  const checkTeilnehmer = (): boolean | string => {
    const mail = String(teilnehmer.get('email') ?? '').trim().toLowerCase();
    if (mail) {
      const taken = flow.lists.teilnehmer.entries.some(
        e => String((e as { values?: Record<string, unknown> }).values?.email ?? '').trim().toLowerCase() === mail,
      );
      if (taken) return tx('Diese E-Mail-Adresse ist in dieser Abstimmung schon eingetragen.');
    }
    return flow.validateStep(3);
  };

  return (
    <IntentWizardShell
      title={tx('Abstimmung anlegen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Lege eine Terminabstimmung mit Terminvorschlägen und Teilnehmern als Entwurf an.'),
        needs: [tx('Titel und Organisator'), tx('Mögliche Termine'), tx('Namen und E-Mails der Teilnehmer')],
      }}
    >
      <WizardStep label={tx('Grunddaten')} description={tx('Worum geht es und bis wann sollen die Teilnehmer antworten?')}>
        <div className="space-y-4">
          <Bound form={flow.forms.terminabstimmungen} name="titel" />
          <Bound form={flow.forms.terminabstimmungen} name="beschreibung" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Bound form={flow.forms.terminabstimmungen} name="organisator_vorname" />
            <Bound form={flow.forms.terminabstimmungen} name="organisator_nachname" />
          </div>
          <Bound form={flow.forms.terminabstimmungen} name="organisator_email" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Bound form={flow.forms.terminabstimmungen} name="standarddauer_minuten" hint={tx('In Minuten, z. B. 60')} />
            <Bound form={flow.forms.terminabstimmungen} name="antwortfrist" />
          </div>
          <Bound form={flow.forms.terminabstimmungen} name="ort" />
          <Bound form={flow.forms.terminabstimmungen} name="meeting_link" />
          <Bound form={flow.forms.terminabstimmungen} name="zeitzone" />
          <Bound form={flow.forms.terminabstimmungen} name="entscheidungsregel" />
          <StepNav hideBack onNext={() => flow.validateStep(1)} nextStepLabel={tx('Terminvorschläge')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Terminvorschläge')} description={tx('Füge alle möglichen Termine hinzu und vergib die Reihenfolge.')}>
        <div className="space-y-4">
          <ListEntries list={flow.lists.terminvorschlaege}>
            <Bound form={vorschlaege} name="start" />
            <Bound form={vorschlaege} name="ende" />
            <Bound form={vorschlaege} name="ort_abweichend" />
            <Bound form={vorschlaege} name="meeting_link_abweichend" />
            <Bound form={vorschlaege} name="reihenfolge" hint={tx('1 = erster Vorschlag')} />
          </ListEntries>
          <StepNav onBack={() => setStep(1)} onNext={checkVorschlaege} nextStepLabel={tx('Teilnehmer')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Teilnehmer')} description={tx('Wer soll abstimmen? Jede E-Mail-Adresse nur einmal.')}>
        <div className="space-y-4">
          <ListEntries list={flow.lists.teilnehmer}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Bound form={teilnehmer} name="vorname" />
              <Bound form={teilnehmer} name="nachname" />
            </div>
            <Bound form={teilnehmer} name="email" />
            <Bound form={teilnehmer} name="organisation" />
            <Bound form={teilnehmer} name="rolle" />
          </ListEntries>
          <StepNav onBack={() => setStep(2)} onNext={checkTeilnehmer} nextStepLabel={tx('Prüfen')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[{ key: 'status', label: tx('Status'), value: tx('Entwurf') }]}
            confirmLabel={tx('Als Entwurf speichern')}
            whatHappensNext={tx('Die Abstimmung wird als Entwurf gespeichert. Einladungen gehen erst beim Freigeben raus.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          whatHappensNext={tx('Die Abstimmung ist ein Entwurf. Gib sie frei, damit die Teilnehmer ihre Einladung bekommen.')}
          next={[
            { label: tx('Abstimmung freigeben'), href: '#/intents/abstimmung-versenden' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
