import { useMemo, useState } from 'react';
import { parseISO, differenceInHours, format } from 'date-fns';
import { IconAlertTriangle, IconPlus, IconCalendarEvent, IconUsers, IconStars, IconClockHour4, IconBulb } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor } from '@/config/plan';
import type { Terminabstimmungen, Terminvorschlaege, Teilnehmer } from '@/types/app';
import { lookupOption } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import { formatDateTime, lookupKey } from '@/lib/formatters';
import { tx, dateFnsLocale } from '@/i18n';
import { useClock, gruss, namen } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget, type KanbanCard, type KanbanColumn } from '@/components/widgets/KanbanWidget';
import { Button } from '@/components/ui/button';

type Group = 'entwurf' | 'offen' | 'abgelaufen' | 'festgelegt' | 'archiv';
type Filter = 'pending' | 'soon' | 'alt' | null;

interface Poll {
  rec: Terminabstimmungen;
  key: string;
  group: Group;
  total: number;
  pending: Teilnehmer[];
  final?: Terminvorschlaege;
  newAlt: number;
  deadline: Date | null;
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { terminabstimmungen, terminvorschlaege, teilnehmer, rueckmeldungen, alternativeTerminvorschlaege } = data;
  const clock = useClock();
  const [filter, setFilter] = useState<Filter>(null);

  const polls = useMemo<Poll[]>(() => {
    return terminabstimmungen.map(rec => {
      let key = lookupKey(rec.fields.status) ?? 'entwurf';
      const deadline = rec.fields.antwortfrist ? parseISO(rec.fields.antwortfrist) : null;
      if ((key === 'versendet' || key === 'in_abstimmung') && deadline && deadline < clock) key = 'abgelaufen';
      const group: Group =
        key === 'entwurf' ? 'entwurf'
        : key === 'versendet' || key === 'in_abstimmung' ? 'offen'
        : key === 'abgelaufen' ? 'abgelaufen'
        : key === 'festgelegt' ? 'festgelegt'
        : 'archiv';
      const members = teilnehmer.filter(t => extractRecordId(t.fields.terminabstimmung) === rec.record_id);
      const answered = new Set(
        rueckmeldungen
          .filter(r => extractRecordId(r.fields.terminabstimmung) === rec.record_id)
          .map(r => extractRecordId(r.fields.teilnehmer)),
      );
      const pending = members.filter(t => {
        const st = lookupKey(t.fields.einladungsstatus);
        return !answered.has(t.record_id) && !t.fields.geantwortet_am && !t.fields.vollstaendig_abgesagt && st !== 'geantwortet' && st !== 'abgesagt';
      });
      const final = terminvorschlaege.find(v => extractRecordId(v.fields.terminabstimmung) === rec.record_id && v.fields.final_gewaehlt);
      const newAlt = alternativeTerminvorschlaege.filter(a =>
        extractRecordId(a.fields.terminabstimmung) === rec.record_id && (lookupKey(a.fields.status) ?? 'neu') === 'neu').length;
      return { rec, key, group, total: members.length, pending, final, newAlt, deadline };
    });
  }, [terminabstimmungen, terminvorschlaege, teilnehmer, rueckmeldungen, alternativeTerminvorschlaege, clock]);

  // The workflow's next step belongs to a flow (status is flow-owned) — one helper for hero, list and overlay footer.
  const nextStep = (rec: Terminabstimmungen, group: Group) => {
    if (group === 'entwurf') {
      const go = flowActionFor('terminabstimmungen', 'status', rec.record_id, 'versendet');
      return go ? { label: tx('Versenden'), onClick: go } : undefined;
    }
    if (group === 'offen' || group === 'abgelaufen') {
      const go = flowActionFor('terminabstimmungen', 'status', rec.record_id, 'festgelegt');
      return go ? { label: tx('Termin festlegen'), onClick: go } : undefined;
    }
    return undefined;
  };

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'terminabstimmungen') return undefined;
      const p = polls.find(x => x.rec.record_id === top.record.record_id);
      return p ? nextStep(p.rec, p.group) : undefined;
    },
  });

  const openPoll = (p: Poll) => crud.terminabstimmungen.openDetail(p.rec);

  const expired = polls.filter(p => p.group === 'abgelaufen');
  const open = polls.filter(p => p.group === 'offen');
  const waiting = [...open, ...expired].filter(p => p.pending.length > 0);
  const soon = open.filter(p => p.deadline && differenceInHours(p.deadline, clock) <= 48);
  const withAlt = polls.filter(p => (p.group === 'offen' || p.group === 'abgelaufen') && p.newAlt > 0);
  const drafts = polls.filter(p => p.group === 'entwurf');
  const decided = polls.filter(p => p.group === 'festgelegt');

  const visible = polls.filter(p =>
    filter === 'pending' ? waiting.includes(p)
    : filter === 'soon' ? soon.includes(p)
    : filter === 'alt' ? withAlt.includes(p)
    : true);

  const columns: KanbanColumn[] = [
    { key: 'entwurf', label: tx('Entwürfe') },
    { key: 'offen', label: tx('Offen'), tone: 'primary' },
    { key: 'abgelaufen', label: tx('Frist abgelaufen') },
    { key: 'festgelegt', label: tx('Festgelegt'), tone: 'success' },
    { key: 'archiv', label: tx('Archiv') },
  ];

  const cards: KanbanCard[] = [...visible]
    .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity))
    .map(p => {
      const nr = p.rec.fields.abstimmungsnummer ?? '';
      let sub: string;
      if (p.group === 'festgelegt' && p.final) sub = tx`${formatDateTime(p.final.fields.start)} · ${p.total} Teilnehmer`;
      else if (p.group === 'entwurf') sub = tx`${nr} · ${p.total} Teilnehmer`;
      else if (p.group === 'archiv') sub = tx`${nr} · ${p.rec.fields.status?.label ?? ''}`;
      else sub = tx`Frist ${formatDateTime(p.rec.fields.antwortfrist)} · ${p.total - p.pending.length} von ${p.total} geantwortet`;
      return {
        id: `abstimmung:${p.rec.record_id}`,
        column: p.group,
        title: p.rec.fields.titel ?? nr,
        subtitle: sub,
        tone: p.group === 'festgelegt' ? 'success' : 'default',
      };
    });

  // Terminvorschläge ranked by Eignung, then Ja — live counts from the Rückmeldungen
  const rankedProposals = useMemo(() => {
    const active = new Map(polls.filter(p => p.group === 'offen' || p.group === 'abgelaufen').map(p => [p.rec.record_id, p]));
    return terminvorschlaege.flatMap(v => {
      const poll = active.get(extractRecordId(v.fields.terminabstimmung) ?? '');
      if (!poll) return [];
      let ja = 0, wn = 0, nein = 0;
      rueckmeldungen.forEach(r => {
        if (extractRecordId(r.fields.terminvorschlag) !== v.record_id) return;
        const k = lookupKey(r.fields.verfuegbarkeit);
        if (k === 'ja') ja++; else if (k === 'wenn_noetig') wn++; else if (k === 'nein') nein++;
      });
      const answers = ja + wn + nein;
      const eig = lookupKey(v.fields.eignung)
        ?? (answers === 0 ? undefined : nein === 0 ? (ja >= wn ? 'sehr_gut' : 'gut') : ja > nein ? 'bedingt' : 'ungeeignet');
      const rank = ['sehr_gut', 'gut', 'bedingt', 'ungeeignet'].indexOf(eig ?? '');
      return [{ v, poll, ja, wn, nein, eig, rank: rank < 0 ? 4 : rank }];
    }).sort((a, b) => a.rank - b.rank || b.ja - a.ja || b.wn - a.wn).slice(0, 8);
  }, [polls, terminvorschlaege, rueckmeldungen]);

  const toneWord = (eig?: string) =>
    eig === 'sehr_gut' || eig === 'gut' ? 'text-emerald-600' : eig === 'ungeeignet' ? 'text-destructive' : 'text-amber-600';

  // Context line — names things in every branch
  const titles = (xs: Poll[]) => namen(xs.map(p => p.rec.fields.titel ?? p.rec.fields.abstimmungsnummer ?? ''));
  let context: string;
  if (polls.length === 0) context = tx`Lege deine erste Terminabstimmung an.`;
  else if (expired.length > 0) context = tx`Bei ${titles(expired)} ist die Frist vorbei — Zeit, den Termin festzulegen.`;
  else if (waiting.length > 0) context = tx`Bei ${titles(waiting)} fehlen noch Antworten von ${namen(waiting[0].pending.map(t => t.fields.vorname ?? ''))}.`;
  else if (drafts.length > 0) context = tx`${titles(drafts)} wartet als Entwurf auf den Versand.`;
  else if (decided.length > 0) context = tx`Zuletzt festgelegt: ${titles(decided)}.`;
  else context = tx`Alle Abstimmungen sind abgeschlossen.`;

  const createButton = crud.terminabstimmungen.canWrite && (
    <Button onClick={() => crud.terminabstimmungen.openCreate({ status: 'entwurf', zeitzone: 'europe_berlin', standarddauer_minuten: 60 })}>
      <IconPlus size={16} className="shrink-0" />
      <span className="ml-1">{tx('Neue Abstimmung')}</span>
    </Button>
  );

  const firstExpired = expired[0];
  const hero = firstExpired ? (
    <HeroBanner
      icon={<IconAlertTriangle size={18} />}
      action={nextStep(firstExpired.rec, 'abgelaufen') ?? { label: tx('Auswertung öffnen'), onClick: () => openPoll(firstExpired) }}
    >
      {expired.length === 1
        ? tx`${titles(expired)}: Die Antwortfrist ist abgelaufen — ${firstExpired.total - firstExpired.pending.length} von ${firstExpired.total} haben geantwortet.`
        : tx`${titles(expired)}: Die Antwortfristen sind abgelaufen — jetzt Termine festlegen.`}
    </HeroBanner>
  ) : undefined;

  const empty = polls.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{context}</p>
        </div>
        {createButton}
      </div>

      {empty ? (
        <div className="rounded-[27px] bg-card p-10 shadow-lg text-center space-y-4">
          <IconCalendarEvent size={48} className="mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{tx('Noch keine Terminabstimmung — lege Terminvorschläge an und lade Teilnehmer ein.')}</p>
          {createButton}
        </div>
      ) : (
      <DashboardGrid
        variant="wide"
        hero={hero}
        kpis={empty ? undefined : (
          <StatStrip>
            <StatStripItem
              title={tx('Antworten fehlen')}
              value={waiting.length}
              icon={<IconUsers size={16} className="text-muted-foreground" />}
              onClick={() => setFilter(f => (f === 'pending' ? null : 'pending'))}
              active={filter === 'pending'}
            />
            <StatStripItem
              title={tx('Frist in 48 Std.')}
              value={soon.length}
              tone={soon.length > 0 ? 'warning' : 'default'}
              icon={<IconClockHour4 size={16} className="text-muted-foreground" />}
              onClick={() => setFilter(f => (f === 'soon' ? null : 'soon'))}
              active={filter === 'soon'}
            />
            <StatStripItem
              title={tx('Neue Alternativen')}
              value={withAlt.reduce((n, p) => n + p.newAlt, 0)}
              icon={<IconBulb size={16} className="text-muted-foreground" />}
              onClick={() => setFilter(f => (f === 'alt' ? null : 'alt'))}
              active={filter === 'alt'}
            />
          </StatStrip>
        )}
        aside={empty ? undefined : (
          <>
            <WorkList
              title={tx('Terminvorschläge nach Eignung')}
              icon={<IconStars size={14} />}
              items={rankedProposals.map(({ v, poll, ja, wn, nein, eig }) => ({
                id: v.record_id,
                title: poll.rec.fields.titel ?? poll.rec.fields.abstimmungsnummer ?? '',
                secondLine: (
                  <>
                    <span className={`font-medium ${toneWord(eig)}`}>{eig ? lookupOption('terminvorschlaege', 'eignung', eig).label : tx('Noch keine Antworten')}</span>
                    <span className="text-muted-foreground"> · {v.fields.start ? format(parseISO(v.fields.start), 'EEE d. MMM, HH:mm', { locale: dateFnsLocale() }) : '—'} · {tx`${ja} Ja · ${wn} Wenn nötig · ${nein} Nein`}</span>
                  </>
                ),
              }))}
              onItemClick={id => {
                const v = terminvorschlaege.find(x => x.record_id === id);
                if (v) crud.terminvorschlaege.openDetail(v);
              }}
              empty={{ text: tx('Sobald Antworten eintreffen, erscheinen hier die besten Terminvorschläge.') }}
            />
            <WorkList
              title={tx('Ausstehende Antworten')}
              icon={<IconCalendarEvent size={14} />}
              items={waiting
                .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity))
                .map(p => {
                  const step = nextStep(p.rec, p.group);
                  return {
                    id: p.rec.record_id,
                    title: p.rec.fields.titel ?? p.rec.fields.abstimmungsnummer ?? '',
                    secondLine: (
                      <>
                        <span className="font-medium text-amber-600">{tx`${p.pending.length} ausstehend`}</span>
                        <span className="text-muted-foreground"> · {namen(p.pending.map(t => `${t.fields.vorname ?? ''} ${t.fields.nachname ?? ''}`.trim()), 2)} · {formatDateTime(p.rec.fields.antwortfrist)}</span>
                      </>
                    ),
                    action: step,
                  };
                })}
              onItemClick={id => {
                const p = polls.find(x => x.rec.record_id === id);
                if (p) openPoll(p);
              }}
              empty={{
                text: drafts[0]
                  ? tx`Alle haben geantwortet — als Nächstes: ${drafts[0].rec.fields.titel ?? ''} versenden.`
                  : tx`Keine offenen Rückmeldungen.`,
              }}
            />
          </>
        )}
        primary={(
          <KanbanWidget
            cards={cards}
            columns={columns}
            defaultCollapsed={['archiv']}
            onCardClick={card => {
              const p = polls.find(x => x.rec.record_id === card.id.split(':')[1]);
              if (p) openPoll(p);
            }}
          />
        )}
      />
      )}
      {crud.surfaces}
    </div>
  );
}
