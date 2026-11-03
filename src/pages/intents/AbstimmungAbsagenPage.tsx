/**
 * Abstimmung absagen oder archivieren — 3-Schritt-Wizard plus Prüfen.
 * Steps: 1) Abstimmung wählen → 2) Absagen oder Archivieren → 3) Optional Kommentar → 4) Prüfen & bestätigen.
 * Reads: terminabstimmungen (titel, status). Writes: terminabstimmungen (status, entscheidungskommentar, abgesagt_am) — Update des gewählten Datensatzes.
 * Composes: IntentWizardShell, EntitySelectStep, Field, ChoiceGroup, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldLookup } from '@/lib/journey';
import { useAbstimmungAbsagenFlow } from '@/lib/journey/flows/AbstimmungAbsagen';
import { tx } from '@/i18n';

const ALLOWED_STATUS = ['abgesagt', 'archiviert'];

export default function AbstimmungAbsagenPage() {
  const [step, setStep] = useState(1);
  const flow = useAbstimmungAbsagenFlow({
    steps: { terminabstimmungen: 1, status: 2, entscheidungskommentar: 3 },
    items: {
      terminabstimmungen: r => ({
        id: r.id,
        title: fieldText(r, 'titel'),
        subtitle: fieldLookup(r, 'status')?.label,
      }),
    },
  });
  const form = flow.forms.terminabstimmungen;

  const statusOptions = form.choice('status').options.filter(o => ALLOWED_STATUS.includes(o.key));

  const validateStatus = () => {
    if (!form.validate(['status'])) return false;
    if (!ALLOWED_STATUS.includes(String(form.get('status') ?? ''))) {
      return tx('Bitte „Absagen“ oder „Archivieren“ wählen.');
    }
    return true;
  };

  return (
    <IntentWizardShell
      title={tx('Abstimmung absagen oder archivieren')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Eine Abstimmung absagen oder ins Archiv legen.'),
        needs: [tx('Die betroffene Abstimmung')],
      }}
    >
      <WizardStep label={tx('Abstimmung')} description={tx('Welche Abstimmung soll abgesagt oder archiviert werden?')}>
        <EntitySelectStep
          {...flow.picks.terminabstimmungen.select}
          {...flow.pick('terminabstimmungen')}
          searchPlaceholder={tx('Titel der Abstimmung …')}
        />
      </WizardStep>
      <WizardStep
        label={tx('Aktion')}
        description={tx('Absagen, wenn der Termin entfällt — Archivieren, wenn die Abstimmung nur abgelegt werden soll.')}
        needs={['terminabstimmungen']}
      >
        <Field form={form} name="status">
          <ChoiceGroup {...form.choice('status')} options={statusOptions} />
        </Field>
        <StepNav onBack={() => setStep(1)} onNext={validateStatus} nextStepLabel={tx('Kommentar')} />
      </WizardStep>
      <WizardStep
        label={tx('Kommentar')}
        description={tx('Optional: Begründe kurz, warum die Abstimmung beendet wird.')}
        needs={['terminabstimmungen', 'status']}
      >
        <Bound form={form} name="entscheidungskommentar" rows={3} hint={tx('Optional')} />
        <StepNav onBack={() => setStep(2)} onNext={() => flow.validateStep(3)} nextStepLabel={tx('Prüfen')} />
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[{ key: 'abgesagt_am', label: tx('Zeitpunkt'), value: tx('Jetzt — wird automatisch gesetzt') }]}
            whatHappensNext={tx('Der Status der Abstimmung ändert sich sofort.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          actions={{ copy: false, print: false }}
          next={[
            { label: tx('Abstimmung anlegen'), href: '#/intents/abstimmung-anlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
