import type { DurableEventPayload, LocalAssessment } from '../domain/normalization';
import type { EventAction, EventTime, Provider } from '../domain/event';

export interface TelegramRenderContext {
  readonly previousVersion?: DurableEventPayload;
}

export type TelegramRenderResult = { readonly ok: true; readonly text: string } |
  { readonly ok: false; readonly reason: string };

const MAX_MESSAGE_UTF16 = 4096;
const ATTRIBUTION: Record<Provider, { readonly name: string; readonly url: string }> = {
  claude: { name: 'Claude Resets', url: 'https://clauderesets.com/' },
  codex: { name: 'codexreset.ai', url: 'https://codexreset.ai/' },
};
const ACTION_ASSERTION: Partial<Record<EventAction, LocalAssessment['assertion']>> = {
  announced_future: 'future_announcement',
  confirmed_applied: 'applied',
  banked_offer: 'banked_offer',
  correction: 'correction',
  withdrawal: 'withdrawal',
};
const WINDOW_LABELS: Record<string, string> = {
  five_hour: 'пятичасовое окно',
  weekly: 'недельный лимит',
  other: 'другое окно лимитов',
  unspecified: 'окно лимитов источником не уточнено',
};

function fail(reason: string): TelegramRenderResult {
  return { ok: false, reason };
}

function isSafeText(value: unknown): value is string {
  if (typeof value !== 'string' || !isWellFormedUnicode(value)) return false;
  // Reject C0/C1 controls, line separators, bidi controls, and invisible direction marks.
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function safeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !isSafeText(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '' &&
      url.hostname.length > 0 && url.href === value;
  } catch { return false; }
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validExactTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) ||
      !validDate(value.slice(0, 10))) return false;
  const clock = value.slice(11, 19);
  const [hours, minutes, seconds] = clock.split(':').map(Number);
  return hours! < 24 && minutes! < 60 && seconds! < 60;
}

function formatTime(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const time = value as Partial<EventTime>;
  const keys = Object.keys(time);
  if (time.precision === 'unknown' && keys.length === 1) return 'дата и время источником не указаны';
  if (time.precision === 'date' && keys.length === 2 && typeof time.on === 'string' && validDate(time.on)) return time.on;
  if (time.precision === 'exact' && keys.length === 2 && typeof time.at === 'string' &&
      isSafeText(time.at) && validExactTime(time.at)) return `${time.at} (UTC)`;
  return null;
}

function accepted(payload: DurableEventPayload): LocalAssessment | null {
  const evidence = payload.reviewedEvidence;
  const expectedAssertion = ACTION_ASSERTION[payload.record.action];
  if (!expectedAssertion || !evidence || evidence.assertion !== expectedAssertion ||
      payload.rawKey !== evidence.recordKey || payload.reviewReasons.length !== 0 ||
      payload.record.provenance.historicalSeed || payload.record.action === 'needs_review') return null;
  if (!safeHttpsUrl(evidence.primarySourceUrl) || evidence.evidenceUrls.length === 0 ||
      !evidence.evidenceUrls.includes(evidence.primarySourceUrl) ||
      !evidence.evidenceUrls.every(safeHttpsUrl) ||
      !payload.record.provenance.evidenceUrls.includes(evidence.primarySourceUrl) ||
      !payload.record.provenance.evidenceUrls.every(safeHttpsUrl)) return null;
  if (payload.record.provider !== 'claude' && payload.record.provider !== 'codex') return null;
  return evidence;
}

function objectFacts(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function sameTimestamp(value: unknown, time: EventTime): boolean {
  return time.precision === 'exact' && value === time.at;
}

function validRawAction(payload: DurableEventPayload): boolean {
  const facts = objectFacts(payload.rawFacts);
  if (!facts) return false;
  const rawKind = facts.kind;
  if (payload.record.provider === 'claude') {
    if (!['usage_reset', 'credit'].includes(String(rawKind)) || payload.record.provenance.rawKind !== rawKind) return false;
    if (payload.record.action === 'confirmed_applied') {
      return rawKind === 'usage_reset' && facts.status === 'confirmed' && facts.allocation === 'subscription_usage';
    }
    if (payload.record.action === 'announced_future') {
      return rawKind === 'usage_reset' && facts.status === 'announced' && facts.allocation === 'subscription_usage';
    }
    if (payload.record.action === 'banked_offer') return rawKind === 'credit';
    return true;
  }

  if (facts.certainty !== undefined) {
    if (facts.certainty !== 'announced' || rawKind !== undefined) return false;
  } else if (rawKind !== 'regular' && rawKind !== 'banked') return false;
  if (rawKind !== undefined && payload.record.provenance.rawKind !== rawKind) return false;
  if (facts.seeded === true || payload.record.provenance.historicalSeed) return false;
  if (payload.record.action === 'confirmed_applied') {
    const verified = payload.verifiedDelivery;
    const rawUrl = facts.deliveredSourceUrl;
    return rawKind === 'regular' && typeof facts.deliveredAt === 'string' &&
      sameTimestamp(facts.deliveredAt, verified) && sameTimestamp(facts.deliveredAt, payload.upstreamReportedDelivery) &&
      verified.precision === 'exact' && safeHttpsUrl(rawUrl) &&
      payload.reviewedEvidence?.evidenceUrls.includes(rawUrl) === true;
  }
  if (payload.record.action === 'announced_future') {
    return facts.certainty === 'announced' ||
      (rawKind === 'regular' && facts.deliveredAt === null);
  }
  if (payload.record.action === 'banked_offer') return rawKind === 'banked';
  return true;
}

function validFutureTime(payload: DurableEventPayload, evidence: LocalAssessment): boolean {
  if (payload.record.action !== 'announced_future') return true;
  const expected = payload.expectedTime;
  const target = payload.verifiedFutureTarget;
  const expectedIsUnknown = expected.precision === 'unknown';
  if (target === null) {
    if (!expectedIsUnknown) return false;
  } else if (expected.precision !== target.precision || !sameTime(expected, target)) return false;
  const assessed = evidence.futureTarget;
  if (assessed && assessed.precision !== 'unknown' &&
      (!target || assessed.precision !== target.precision || !sameTime(assessed, target))) return false;
  return true;
}

function audience(payload: DurableEventPayload): string | null {
  const source = payload.record.audience;
  if (source === null) return null;
  if (!isSafeText(source) || source.trim() === '') return null;
  return source.trim();
}

function audienceLine(payload: DurableEventPayload): string {
  return `Кому: ${audience(payload) ?? 'источником не уточнено'}`;
}

function windowLine(payload: DurableEventPayload): string | null {
  if (payload.windows === undefined) return null;
  if (!Array.isArray(payload.windows) || payload.windows.length === 0) return null;
  const labels: string[] = [];
  for (const window of payload.windows) {
    const label = WINDOW_LABELS[window];
    if (!label) return null;
    if (!labels.includes(label)) labels.push(label);
  }
  return `Какие лимиты: ${labels.join(', ')}`;
}

function identity(payload: DurableEventPayload): string {
  return JSON.stringify([
    payload.record.provider,
    payload.record.provenance.upstream,
    payload.record.provenance.externalId,
  ]);
}

function sameTime(left: EventTime, right: EventTime): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function correctedFacts(current: DurableEventPayload, previous: DurableEventPayload): string[] | null {
  const details: string[] = [];
  const currentAudience = audience(current);
  if (currentAudience !== audience(previous)) {
    details.push(`Аудитория: ${currentAudience ?? 'источником не уточнена'}.`);
  }
  const currentWindow = windowLine(current);
  if (currentWindow !== windowLine(previous)) {
    details.push(`${currentWindow ?? 'Окна лимитов источником не уточнены.'}.`);
  }
  const currentExpected = formatTime(current.expectedTime);
  const previousExpected = formatTime(previous.expectedTime);
  if (currentExpected !== previousExpected && currentExpected !== null) {
    details.push(`Ожидаемое время: ${currentExpected}.`);
  }
  const currentDelivery = formatTime(current.verifiedDelivery);
  if (!sameTime(current.verifiedDelivery, previous.verifiedDelivery) && currentDelivery !== null) {
    details.push(`Подтверждённое применение: ${currentDelivery}.`);
  }
  const currentExpiry = canonicalExpiry(current);
  const previousExpiry = canonicalExpiry(previous);
  if (currentExpiry === undefined || previousExpiry === undefined) return null;
  if (currentExpiry !== previousExpiry) {
    details.push(`Срок предложения: ${currentExpiry ?? 'источником не указан'}.`);
  }
  const currentEffective = canonicalEffective(current);
  const previousEffective = canonicalEffective(previous);
  if (currentEffective === null || previousEffective === null) return null;
  if (!sameTime(currentEffective, previousEffective)) {
    const effective = formatTime(currentEffective);
    if (currentEffective.precision === 'unknown') {
      details.push('Указанное время применения по записи источника: не указано.');
    } else if (effective !== null) {
      details.push(`Указанное время применения по записи источника: ${effective}.`);
    } else return null;
  }
  if (!rawChangesAreRepresented(current, previous)) return null;
  return details;
}

function rawChangesAreRepresented(current: DurableEventPayload, previous: DurableEventPayload): boolean {
  const currentFacts = objectFacts(current.rawFacts);
  const previousFacts = objectFacts(previous.rawFacts);
  if (!currentFacts || !previousFacts) return false;
  const keys = new Set([...Object.keys(currentFacts), ...Object.keys(previousFacts)]);
  for (const key of keys) {
    const before = previousFacts[key];
    const after = currentFacts[key];
    if (JSON.stringify(before) === JSON.stringify(after) || key === 'revision' || key === 'correction') continue;
    if (key === 'effectiveAt') {
      if (sameTime(current.record.effective, previous.record.effective)) return false;
      continue;
    }
    if (key === 'resetOfferExpiresOn') {
      if (current.record.expiresOn === previous.record.expiresOn) return false;
      continue;
    }
    if (key === 'audience') {
      if (audience(current) === audience(previous)) return false;
      continue;
    }
    if (key === 'windows') {
      if (windowLine(current) === windowLine(previous)) return false;
      continue;
    }
    return false;
  }
  return true;
}

function canonicalExpiry(payload: DurableEventPayload): string | null | undefined {
  const facts = objectFacts(payload.rawFacts);
  if (!facts) return undefined;
  const rawExpiry = facts.resetOfferExpiresOn;
  const expiry = payload.record.expiresOn;
  if (expiry !== null && (!isSafeText(expiry) || !validDate(expiry))) return undefined;
  if (rawExpiry !== undefined && rawExpiry !== expiry) return undefined;
  if (expiry !== null && rawExpiry === undefined) return undefined;
  return expiry;
}

function canonicalEffective(payload: DurableEventPayload): EventTime | null {
  const facts = objectFacts(payload.rawFacts);
  if (!facts) return null;
  const effective = payload.record.effective;
  const rawEffective = facts.effectiveAt;
  if (effective.precision === 'unknown') {
    return rawEffective === undefined || rawEffective === null ? effective : null;
  }
  if (effective.precision === 'exact' && rawEffective === effective.at && validExactTime(effective.at)) return effective;
  if (effective.precision === 'date' && rawEffective === effective.on && validDate(effective.on)) return effective;
  return null;
}

function renderFacts(payload: DurableEventPayload): string[] | null {
  if (payload.record.audience !== null && !isSafeText(payload.record.audience)) return null;
  const facts = [audienceLine(payload)];
  const windows = windowLine(payload);
  if (payload.windows !== undefined && windows === null) return null;
  if (windows) facts.push(windows);
  return facts;
}

function compose(payload: DurableEventPayload, evidence: LocalAssessment, context?: TelegramRenderContext): string | null {
  const provider = payload.record.provider === 'claude' ? 'CLAUDE' : 'CODEX';
  const attribution = ATTRIBUTION[payload.record.provider];
  const facts = renderFacts(payload);
  if (!facts || !safeHttpsUrl(attribution.url)) return null;
  const primary = evidence.primarySourceUrl;
  let lines: string[];

  switch (payload.record.action) {
    case 'announced_future': {
      const target = payload.verifiedFutureTarget ?? payload.expectedTime;
      const formatted = formatTime(target);
      if (!formatted) return null;
      lines = [
        `📣 [${provider}] Анонсирован предстоящий сброс`, '',
        `Когда: ${formatted}`, ...facts, '',
        'Это анонс, а не подтверждение применения; фактическое обновление может отличаться.',
      ];
      break;
    }
    case 'confirmed_applied': {
      const delivery = formatTime(payload.verifiedDelivery);
      if (!delivery) return null;
      lines = [
        `✅ [${provider}] Подтверждено применение сброса лимитов`, '',
        ...facts, `Время применения: ${delivery}.`, '',
        'Проверьте актуальные лимиты в своём аккаунте.',
      ];
      break;
    }
    case 'banked_offer': {
      const expires = payload.record.expiresOn;
      if (expires !== null && (!isSafeText(expires) || !validDate(expires))) return null;
      lines = [
        `🎁 [${provider}] Предложение дополнительного сброса`, '',
        ...facts,
        `Срок предложения: ${expires ?? 'источником не указан'}.`,
        'Это предложение, а не подтверждение сброса или текущей доступности. Условия и необходимость действия проверьте в аккаунте.',
      ];
      break;
    }
    case 'correction': {
      const previous = context?.previousVersion;
      if (!previous || identity(previous) !== identity(payload) ||
          !evidence.previousTransitionId || !isSafeText(evidence.previousTransitionId)) return null;
      const changes = correctedFacts(payload, previous);
      if (!changes || changes.length === 0) return null;
      lines = [
        `⚠️ [${provider}] Исправление сведений о событии`, '',
        ...changes,
        ...facts,
      ];
      break;
    }
    case 'withdrawal': {
      const previous = context?.previousVersion;
      if (!previous || identity(previous) !== identity(payload) ||
          !evidence.previousTransitionId || !isSafeText(evidence.previousTransitionId)) return null;
      lines = [
        `⚠️ [${provider}] Источник отозвал сведения о событии`, '',
        'Это сообщение подтверждает отзыв сведений источником; оно не утверждает, что прежняя публикация была в Telegram.',
        ...facts,
      ];
      break;
    }
    default:
      return null;
  }
  lines.push('', `Первоисточник: ${primary}`, `Данные трекера: ${attribution.url}`,
    'Независимая сводка Reset Radar; проект не связан с провайдером.');
  return lines.join('\n');
}

/** Renders a reviewed, evidence-bound event as unformatted Telegram plain text. */
export function renderTelegramMessage(
  payload: DurableEventPayload,
  context?: TelegramRenderContext,
): TelegramRenderResult {
  const evidence = accepted(payload);
  if (!evidence) return fail('event_not_eligible');
  if (!validRawAction(payload) || !validFutureTime(payload, evidence)) return fail('event_facts_not_consistent');
  if (payload.record.action === 'correction' || payload.record.action === 'withdrawal') {
    const previous = context?.previousVersion;
    if (!previous || identity(previous) !== identity(payload) || !evidence.previousTransitionId) {
      return fail('previous_transition_required');
    }
  }
  const text = compose(payload, evidence, context);
  if (!text) return fail('unsupported_or_invalid_public_fact');
  if (!isWellFormedUnicode(text)) return fail('invalid_unicode');
  if (text.length > MAX_MESSAGE_UTF16) return fail('message_too_long');
  return { ok: true, text };
}
