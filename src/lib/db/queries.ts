// Track C owns this file (additive). It is the ONLY read path the UI uses:
// every export returns plain serializable objects so server components can hand
// them straight to client components without adapters.

import { db } from "./client";
import {
  activityLog,
  banditArms,
  banditObservations,
  dmMessages,
  dmThreads,
  engagements,
  funnelEvents,
  outcomeReports,
  personas,
  playbookRules,
  playbookVersions,
  posts,
  proposals,
  settings,
  worlds,
} from "./schema";
import type { Archetype, PostPayload, PredictedEffect, TimeSlot } from "@/lib/types";
import { TIME_SLOTS } from "@/lib/types";
import { formatSimTime, TICKS_PER_DAY } from "@/lib/sim/time";
import { postMetrics, type PostMetrics } from "@/lib/sim/metrics";
import { getRulePerformance, type RulePerformance } from "@/lib/learning/ruleEvidence";
import { and, desc, eq } from "drizzle-orm";

// ── world ────────────────────────────────────────────────────────────────────

export interface WorldSummary {
  id: string;
  name: string;
  productDescription: string;
  simTick: number;
  simLabel: string;
  day: number;
  status: string;
  followers: number;
  personaCount: number;
  mode: "propose" | "autopilot";
  paused: boolean;
  playbookVersion: number;
  pendingCount: number;
}

export function getWorlds(): WorldSummary[] {
  return db
    .select()
    .from(worlds)
    .all()
    .map((w) => getWorld(w.id)!)
    .filter(Boolean);
}

export function getWorld(worldId: string): WorldSummary | null {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get();
  if (!world) return null;
  const config = db.select().from(settings).where(eq(settings.worldId, worldId)).get();
  const people = db.select().from(personas).where(eq(personas.worldId, worldId)).all();
  const version = db
    .select()
    .from(playbookVersions)
    .where(eq(playbookVersions.worldId, worldId))
    .orderBy(desc(playbookVersions.version))
    .get();
  const pending = db
    .select()
    .from(proposals)
    .where(and(eq(proposals.worldId, worldId), eq(proposals.status, "pending")))
    .all();

  return {
    id: world.id,
    name: world.name,
    productDescription: world.productDescription,
    simTick: world.simTick,
    simLabel: formatSimTime(world.simTick),
    day: Math.floor(world.simTick / TICKS_PER_DAY) + 1,
    status: world.status,
    followers: people.filter((p) => p.isFollower).length,
    personaCount: people.length,
    mode: (config?.mode as "propose" | "autopilot") ?? "propose",
    paused: config?.paused ?? false,
    playbookVersion: version?.version ?? 0,
    pendingCount: pending.length,
  };
}

export interface WorldSettings {
  mode: "propose" | "autopilot";
  maxPostsPerDay: number;
  maxDmsPerDay: number;
  quietHours: [number, number];
  imageBudget: number;
  bannedTopics: string[];
  paused: boolean;
}

export function getSettings(worldId: string): WorldSettings | null {
  const row = db.select().from(settings).where(eq(settings.worldId, worldId)).get();
  if (!row) return null;
  return {
    mode: row.mode as "propose" | "autopilot",
    maxPostsPerDay: row.maxPostsPerDay,
    maxDmsPerDay: row.maxDmsPerDay,
    quietHours: row.quietHours as [number, number],
    imageBudget: row.imageBudget,
    bannedTopics: row.bannedTopics as string[],
    paused: row.paused,
  };
}

// ── feed (C1) ────────────────────────────────────────────────────────────────

export interface FeedComment {
  id: string;
  handle: string;
  displayName: string;
  segment: string;
  text: string;
  tick: number;
}

export interface FeedPost {
  id: string;
  authorType: "brand" | "ambient";
  ambientAuthor: string | null;
  archetype: Archetype;
  topic: string;
  caption: string;
  hashtags: string[];
  creativeBrief: string;
  imageUrl: string | null;
  publishedTick: number | null;
  publishedLabel: string | null;
  status: string;
  metrics: PostMetrics;
  comments: FeedComment[];
}

export function getFeed(worldId: string, limit = 50): FeedPost[] {
  const rows = db
    .select()
    .from(posts)
    .where(eq(posts.worldId, worldId))
    .all()
    .filter((p) => p.status === "published")
    .sort((a, b) => (b.publishedTick ?? 0) - (a.publishedTick ?? 0))
    .slice(0, limit);

  const people = new Map(
    db.select().from(personas).where(eq(personas.worldId, worldId)).all().map((p) => [p.id, p]),
  );

  return rows.map((post) => ({
    id: post.id,
    authorType: post.authorType as "brand" | "ambient",
    ambientAuthor: post.ambientAuthor,
    archetype: post.archetype as Archetype,
    topic: post.topic,
    caption: post.caption,
    hashtags: post.hashtags as string[],
    creativeBrief: post.creativeBrief,
    imageUrl: post.imageUrl,
    publishedTick: post.publishedTick,
    publishedLabel: post.publishedTick === null ? null : formatSimTime(post.publishedTick),
    status: post.status,
    metrics: postMetrics(worldId, post.id),
    comments: db
      .select()
      .from(engagements)
      .where(and(eq(engagements.postId, post.id), eq(engagements.kind, "comment")))
      .all()
      .map((c) => {
        const persona = people.get(c.personaId);
        return {
          id: c.id,
          handle: persona?.handle ?? "unknown",
          displayName: persona?.displayName ?? "Unknown",
          segment: persona?.segment ?? "",
          text: c.commentText ?? "",
          tick: c.tick,
        };
      })
      .sort((a, b) => a.tick - b.tick),
  }));
}

/** Follower count per tick — drives the ticker in the feed header. */
export function getFollowerSeries(worldId: string): { tick: number; followers: number }[] {
  const follows = db
    .select()
    .from(engagements)
    .where(and(eq(engagements.worldId, worldId), eq(engagements.kind, "follow")))
    .all()
    .sort((a, b) => a.tick - b.tick);

  // personas seeded as followers exist before any follow event
  const seeded =
    db.select().from(personas).where(eq(personas.worldId, worldId)).all().filter((p) => p.isFollower)
      .length - follows.length;

  let running = Math.max(seeded, 0);
  const series = [{ tick: 0, followers: running }];
  for (const f of follows) {
    running++;
    series.push({ tick: f.tick, followers: running });
  }
  return series;
}

// ── approvals ────────────────────────────────────────────────────────────────

export interface ProposalView {
  id: string;
  kind: string;
  status: string;
  payload: PostPayload;
  reasoning: string;
  ruleIds: string[];
  ruleTexts: { ruleKey: string; text: string; category: string }[];
  banditArmId: string | null;
  armLabel: string | null;
  predictedEffect: PredictedEffect;
  riskClass: "normal" | "sensitive";
  createdTick: number;
  createdLabel: string;
  scheduledLabel: string;
}

export function getPendingProposals(worldId: string): ProposalView[] {
  const rows = db
    .select()
    .from(proposals)
    .where(and(eq(proposals.worldId, worldId), eq(proposals.status, "pending")))
    .all()
    .sort((a, b) => a.createdTick - b.createdTick);

  const activeRules = new Map(getActivePlaybook(worldId).rules.map((r) => [r.ruleKey, r]));
  const arms = new Map(
    db.select().from(banditArms).where(eq(banditArms.worldId, worldId)).all().map((a) => [a.id, a]),
  );

  return rows.map((p) => {
    const evidence = p.evidence as { ruleIds?: string[]; banditArmId?: string };
    const payload = p.payload as PostPayload;
    const arm = evidence.banditArmId ? arms.get(evidence.banditArmId) : undefined;
    const ruleIds = evidence.ruleIds ?? [];
    return {
      id: p.id,
      kind: p.kind,
      status: p.status,
      payload,
      reasoning: p.reasoning,
      ruleIds,
      ruleTexts: ruleIds
        .map((id) => activeRules.get(id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map((r) => ({ ruleKey: r.ruleKey, text: r.text, category: r.category })),
      banditArmId: evidence.banditArmId ?? null,
      armLabel: arm ? `${arm.archetype} / ${arm.timeSlot}` : null,
      predictedEffect: p.predictedEffect as PredictedEffect,
      riskClass: p.riskClass as "normal" | "sensitive",
      createdTick: p.createdTick,
      createdLabel: formatSimTime(p.createdTick),
      scheduledLabel: formatSimTime(payload.scheduledTick),
    };
  });
}

// ── activity ─────────────────────────────────────────────────────────────────

export interface ActivityRow {
  id: string;
  tick: number;
  label: string;
  actor: string;
  action: string;
  status: string;
  summary: string;
  refType: string | null;
  refId: string | null;
}

export function getActivity(worldId: string, limit = 100): ActivityRow[] {
  return db
    .select()
    .from(activityLog)
    .where(eq(activityLog.worldId, worldId))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit)
    .all()
    .map((row) => ({
      id: row.id,
      tick: row.tick,
      label: formatSimTime(row.tick),
      actor: row.actor,
      action: row.action,
      status: row.status,
      summary: row.summary,
      refType: row.refType,
      refId: row.refId,
    }));
}

// ── brain: playbook (C2) ─────────────────────────────────────────────────────

export interface PlaybookRuleView {
  id: string;
  ruleKey: string;
  category: string;
  text: string;
  confidence: number;
  evidence: { sourceType: string; refs: string[] };
  /** measured track record — absent until a scored post has cited this rule */
  track: { citations: number; meanReward: number; exceeded: number; missed: number } | null;
}

export interface PlaybookView {
  version: number;
  versionId: string;
  changeSummary: string;
  authorType: string;
  createdTick: number;
  rules: PlaybookRuleView[];
}

function toRuleView(
  r: typeof playbookRules.$inferSelect,
  perf?: Map<string, RulePerformance>,
): PlaybookRuleView {
  const measured = perf?.get(r.ruleKey);
  return {
    id: r.id,
    ruleKey: r.ruleKey,
    category: r.category,
    text: r.text,
    confidence: r.confidence,
    evidence: (r.evidence as PlaybookRuleView["evidence"]) ?? { sourceType: "seed", refs: [] },
    track: measured
      ? {
          citations: measured.citations,
          meanReward: measured.meanReward,
          exceeded: measured.exceeded,
          missed: measured.missed,
        }
      : null,
  };
}

export function getActivePlaybook(worldId: string): PlaybookView {
  const version = db
    .select()
    .from(playbookVersions)
    .where(eq(playbookVersions.worldId, worldId))
    .orderBy(desc(playbookVersions.version))
    .get();
  if (!version) {
    return { version: 0, versionId: "", changeSummary: "", authorType: "seed", createdTick: 0, rules: [] };
  }
  const perf = getRulePerformance(worldId);
  return {
    version: version.version,
    versionId: version.id,
    changeSummary: version.changeSummary,
    authorType: version.authorType,
    createdTick: version.createdTick,
    rules: db
      .select()
      .from(playbookRules)
      .where(and(eq(playbookRules.worldId, worldId), eq(playbookRules.versionId, version.id)))
      .all()
      .map((r) => toRuleView(r, perf)),
  };
}

export interface PlaybookVersionView {
  version: number;
  versionId: string;
  parentVersion: number | null;
  changeSummary: string;
  authorType: string;
  createdTick: number;
  createdLabel: string;
  ruleCount: number;
  added: { ruleKey: string; category: string; text: string }[];
  amended: { ruleKey: string; before: string; after: string }[];
  retired: { ruleKey: string; text: string }[];
}

/** Version timeline with a diff against the parent — the "what changed and why" view. */
export function getPlaybookHistory(worldId: string): PlaybookVersionView[] {
  const versions = db
    .select()
    .from(playbookVersions)
    .where(eq(playbookVersions.worldId, worldId))
    .all()
    .sort((a, b) => a.version - b.version);

  const rulesByVersion = new Map<string, typeof playbookRules.$inferSelect[]>();
  for (const r of db.select().from(playbookRules).where(eq(playbookRules.worldId, worldId)).all()) {
    if (!rulesByVersion.has(r.versionId)) rulesByVersion.set(r.versionId, []);
    rulesByVersion.get(r.versionId)!.push(r);
  }

  return versions.map((v, i) => {
    const current = rulesByVersion.get(v.id) ?? [];
    const previous = i === 0 ? [] : (rulesByVersion.get(versions[i - 1].id) ?? []);
    const before = new Map(previous.map((r) => [r.ruleKey, r]));
    const after = new Map(current.map((r) => [r.ruleKey, r]));

    return {
      version: v.version,
      versionId: v.id,
      parentVersion: v.parentVersion,
      changeSummary: v.changeSummary,
      authorType: v.authorType,
      createdTick: v.createdTick,
      createdLabel: formatSimTime(v.createdTick),
      ruleCount: current.length,
      added: current
        .filter((r) => i > 0 && !before.has(r.ruleKey))
        .map((r) => ({ ruleKey: r.ruleKey, category: r.category, text: r.text })),
      amended: current
        .filter((r) => before.has(r.ruleKey) && before.get(r.ruleKey)!.text !== r.text)
        .map((r) => ({ ruleKey: r.ruleKey, before: before.get(r.ruleKey)!.text, after: r.text })),
      retired: previous
        .filter((r) => !after.has(r.ruleKey))
        .map((r) => ({ ruleKey: r.ruleKey, text: r.text })),
    };
  });
}

// ── brain: bandits (C2) ──────────────────────────────────────────────────────

export interface ArmView {
  id: string;
  archetype: Archetype;
  timeSlot: TimeSlot;
  alpha: number;
  beta: number;
  mean: number;
  observations: number;
  enabled: boolean;
  isChampion: boolean;
  /** Beta pdf sampled on [0,1], scaled so the peak is 1 — for the mini distribution strip. */
  density: number[];
}

const DENSITY_POINTS = 24;

function betaDensity(alpha: number, beta: number): number[] {
  const raw: number[] = [];
  for (let i = 0; i < DENSITY_POINTS; i++) {
    const x = (i + 0.5) / DENSITY_POINTS;
    // unnormalized pdf in log space keeps large alpha/beta from overflowing
    raw.push(Math.exp((alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x)));
  }
  const peak = Math.max(...raw);
  return peak > 0 ? raw.map((v) => v / peak) : raw.map(() => 0);
}

export function getArmDistributions(worldId: string): ArmView[] {
  const arms = db.select().from(banditArms).where(eq(banditArms.worldId, worldId)).all();
  const counts = new Map<string, number>();
  for (const arm of arms) {
    counts.set(
      arm.id,
      db.select().from(banditObservations).where(eq(banditObservations.armId, arm.id)).all().length,
    );
  }
  // Only an arm that has actually been played can be champion. Untried arms all
  // sit on the same prior mean, so crowning one of those would show a "winner"
  // with n=0 ranked above an arm that has real evidence behind it.
  const best = arms
    .filter((a) => (counts.get(a.id) ?? 0) > 0)
    .reduce(
      (top, a) =>
        a.alpha / (a.alpha + a.beta) > top.score
          ? { id: a.id, score: a.alpha / (a.alpha + a.beta) }
          : top,
      { id: "", score: -1 },
    );

  return arms
    .map((a) => ({
      id: a.id,
      archetype: a.archetype as Archetype,
      timeSlot: a.timeSlot as TimeSlot,
      alpha: a.alpha,
      beta: a.beta,
      mean: a.alpha / (a.alpha + a.beta),
      observations: counts.get(a.id) ?? 0,
      enabled: a.enabled,
      isChampion: a.id === best.id,
      density: betaDensity(a.alpha, a.beta),
    }))
    .sort((a, b) => a.archetype.localeCompare(b.archetype) || a.timeSlot.localeCompare(b.timeSlot));
}

// ── brain: calibration (C2) ──────────────────────────────────────────────────

export interface CalibrationPoint {
  postId: string;
  tick: number;
  label: string;
  metric: "impressions" | "likes" | "linkClicks" | "signups";
  predicted: number;
  actual: number;
  hit: boolean;
}

export interface CalibrationSeries {
  points: CalibrationPoint[];
  rolling: { tick: number; label: string; hitRate: number }[];
  overallHitRate: number;
}

const CALIBRATION_METRICS = ["impressions", "likes", "linkClicks", "signups"] as const;
const ROLLING_WINDOW = 5;

/**
 * Predicted-vs-actual per metric, plus a rolling hit rate. "Hit" means the actual
 * landed inside the predicted range — the honest test of whether the strategist's
 * confidence is earned.
 */
export function getCalibrationSeries(worldId: string): CalibrationSeries {
  const reports = db
    .select()
    .from(outcomeReports)
    .where(eq(outcomeReports.worldId, worldId))
    .all()
    .sort((a, b) => a.tick - b.tick);

  const points: CalibrationPoint[] = [];
  const perReportHits: { tick: number; rate: number }[] = [];

  for (const r of reports) {
    const predicted = r.predicted as PredictedEffect;
    const actual = r.actual as PostMetrics;
    let hits = 0;
    for (const metric of CALIBRATION_METRICS) {
      const [lo, hi] = predicted[metric];
      const value = actual[metric];
      const hit = value >= lo && value <= hi;
      if (hit) hits++;
      points.push({
        postId: r.postId,
        tick: r.tick,
        label: formatSimTime(r.tick),
        metric,
        predicted: (lo + hi) / 2,
        actual: value,
        hit,
      });
    }
    perReportHits.push({ tick: r.tick, rate: hits / CALIBRATION_METRICS.length });
  }

  const rolling = perReportHits.map((entry, i) => {
    const window = perReportHits.slice(Math.max(0, i - ROLLING_WINDOW + 1), i + 1);
    return {
      tick: entry.tick,
      label: formatSimTime(entry.tick),
      hitRate: window.reduce((s, w) => s + w.rate, 0) / window.length,
    };
  });

  return {
    points,
    rolling,
    overallHitRate:
      perReportHits.length === 0
        ? 0
        : perReportHits.reduce((s, e) => s + e.rate, 0) / perReportHits.length,
  };
}

// ── analytics (C3) ───────────────────────────────────────────────────────────

export interface FunnelFilters {
  archetype?: Archetype;
  timeSlot?: TimeSlot;
  fromTick?: number;
  toTick?: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
  /** Conversion from the previous stage, 0..1. */
  conversion: number;
}

export function slotForHour(hour: number): TimeSlot | null {
  for (const [slot, hours] of Object.entries(TIME_SLOTS)) {
    if (hours.includes(hour)) return slot as TimeSlot;
  }
  return null;
}

function matchingPostIds(worldId: string, filters: FunnelFilters): Set<string> {
  return new Set(
    db
      .select()
      .from(posts)
      .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand")))
      .all()
      .filter((p) => p.status === "published")
      .filter((p) => !filters.archetype || p.archetype === filters.archetype)
      .filter((p) => !filters.timeSlot || slotForHour((p.publishedTick ?? 0) % TICKS_PER_DAY) === filters.timeSlot)
      .filter((p) => filters.fromTick === undefined || (p.publishedTick ?? 0) >= filters.fromTick)
      .filter((p) => filters.toTick === undefined || (p.publishedTick ?? 0) <= filters.toTick)
      .map((p) => p.id),
  );
}

export function getFunnelSummary(worldId: string, filters: FunnelFilters = {}): FunnelStage[] {
  const ids = matchingPostIds(worldId, filters);
  const totals = { impressions: 0, likes: 0, linkClicks: 0, signups: 0, dmsStarted: 0, meetings: 0 };
  for (const id of ids) {
    const m = postMetrics(worldId, id);
    totals.impressions += m.impressions;
    totals.likes += m.likes;
    totals.linkClicks += m.linkClicks;
    totals.signups += m.signups;
    totals.dmsStarted += m.dmsStarted;
    totals.meetings += m.meetings;
  }

  const ordered: { stage: string; count: number }[] = [
    { stage: "Impressions", count: totals.impressions },
    { stage: "Likes", count: totals.likes },
    { stage: "Link clicks", count: totals.linkClicks },
    { stage: "Signups", count: totals.signups },
    { stage: "DMs", count: totals.dmsStarted },
    { stage: "Meetings", count: totals.meetings },
  ];
  return ordered.map((s, i) => ({
    ...s,
    // an empty previous stage converts nothing — reporting 100% there reads as success
    conversion: i === 0 ? 1 : ordered[i - 1].count === 0 ? 0 : s.count / ordered[i - 1].count,
  }));
}

export interface AttributionRow {
  postId: string;
  archetype: Archetype;
  topic: string;
  caption: string;
  publishedLabel: string;
  timeSlot: TimeSlot | null;
  metrics: PostMetrics;
  verdict: string | null;
  summary: string | null;
  playbookVersion: number;
}

export function getAttribution(worldId: string, filters: FunnelFilters = {}): AttributionRow[] {
  const ids = matchingPostIds(worldId, filters);
  const reports = new Map(
    db
      .select()
      .from(outcomeReports)
      .where(eq(outcomeReports.worldId, worldId))
      .all()
      .map((r) => [r.postId, r]),
  );
  const versions = db
    .select()
    .from(playbookVersions)
    .where(eq(playbookVersions.worldId, worldId))
    .all()
    .sort((a, b) => a.createdTick - b.createdTick);

  return db
    .select()
    .from(posts)
    .where(eq(posts.worldId, worldId))
    .all()
    .filter((p) => ids.has(p.id))
    .sort((a, b) => (b.publishedTick ?? 0) - (a.publishedTick ?? 0))
    .map((p) => {
      const report = reports.get(p.id);
      const tick = p.publishedTick ?? 0;
      // the playbook era a post was published under
      const era = versions.filter((v) => v.createdTick <= tick).at(-1);
      return {
        postId: p.id,
        archetype: p.archetype as Archetype,
        topic: p.topic,
        caption: p.caption,
        publishedLabel: formatSimTime(tick),
        timeSlot: slotForHour(tick % TICKS_PER_DAY),
        metrics: postMetrics(worldId, p.id),
        verdict: report?.verdict ?? null,
        summary: report?.summary ?? null,
        playbookVersion: era?.version ?? 1,
      };
    });
}

export interface EraComparison {
  version: number;
  label: string;
  posts: number;
  impressions: number;
  linkClicks: number;
  signups: number;
  meetings: number;
  clickRate: number;
}

/** "v1 era vs v3 era" — the headline evidence that learning is doing something. */
export function getEraComparison(worldId: string, filters: FunnelFilters = {}): EraComparison[] {
  const rows = getAttribution(worldId, filters);
  const byVersion = new Map<number, AttributionRow[]>();
  for (const row of rows) {
    if (!byVersion.has(row.playbookVersion)) byVersion.set(row.playbookVersion, []);
    byVersion.get(row.playbookVersion)!.push(row);
  }

  return [...byVersion.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([version, group]) => {
      const sum = (pick: (m: PostMetrics) => number) =>
        group.reduce((s, r) => s + pick(r.metrics), 0);
      const impressions = sum((m) => m.impressions);
      const linkClicks = sum((m) => m.linkClicks);
      return {
        version,
        label: `v${version} era`,
        posts: group.length,
        impressions,
        linkClicks,
        signups: sum((m) => m.signups),
        meetings: sum((m) => m.meetings),
        clickRate: impressions === 0 ? 0 : linkClicks / impressions,
      };
    });
}

// ── DMs ──────────────────────────────────────────────────────────────────────

export interface DmThreadView {
  id: string;
  handle: string;
  displayName: string;
  segment: string;
  status: string;
  turnCount: number;
  createdLabel: string;
  messages: { id: string; sender: string; text: string; tick: number }[];
}

export function getDmThreads(worldId: string): DmThreadView[] {
  const people = new Map(
    db.select().from(personas).where(eq(personas.worldId, worldId)).all().map((p) => [p.id, p]),
  );
  return db
    .select()
    .from(dmThreads)
    .where(eq(dmThreads.worldId, worldId))
    .all()
    .sort((a, b) => b.createdTick - a.createdTick)
    .map((t) => {
      const persona = people.get(t.personaId);
      return {
        id: t.id,
        handle: persona?.handle ?? "unknown",
        displayName: persona?.displayName ?? "Unknown",
        segment: persona?.segment ?? "",
        status: t.status,
        turnCount: t.turnCount,
        createdLabel: formatSimTime(t.createdTick),
        messages: db
          .select()
          .from(dmMessages)
          .where(eq(dmMessages.threadId, t.id))
          .all()
          .sort((a, b) => a.tick - b.tick)
          .map((m) => ({ id: m.id, sender: m.sender, text: m.text, tick: m.tick })),
      };
    });
}

/** Funnel events across the world, newest first — the reveal that outcomes are real. */
export function getFunnelEvents(worldId: string, limit = 50) {
  const people = new Map(
    db.select().from(personas).where(eq(personas.worldId, worldId)).all().map((p) => [p.id, p]),
  );
  return db
    .select()
    .from(funnelEvents)
    .where(eq(funnelEvents.worldId, worldId))
    .all()
    .sort((a, b) => b.tick - a.tick)
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      handle: people.get(e.personaId)?.handle ?? "unknown",
      tick: e.tick,
      label: formatSimTime(e.tick),
      sourcePostId: e.sourcePostId,
    }));
}
