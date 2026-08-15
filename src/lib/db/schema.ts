// SHARED FILE — additive-only after Phase 0. Announce changes in docs/PROGRESS.md.
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const worldRef = () => text("world_id").notNull();

export const worlds = sqliteTable("worlds", {
  id: id(),
  name: text("name").notNull(),
  productDescription: text("product_description").notNull(),
  simTick: integer("sim_tick").notNull().default(0),
  seed: text("seed").notNull(),
  // hidden ground truth: affinity matrix, algo params — see WorldConfig in types.ts
  config: text("config", { mode: "json" }).notNull(),
  status: text("status").notNull().default("active"), // active | paused
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const personas = sqliteTable("personas", {
  id: id(),
  worldId: worldRef(),
  handle: text("handle").notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull(),
  segment: text("segment").notNull(),
  // hidden state — see PersonaHidden in types.ts
  hidden: text("hidden", { mode: "json" }).notNull(),
  isFollower: integer("is_follower", { mode: "boolean" }).notNull().default(false),
  fatigue: integer("fatigue").notNull().default(0),
});

export const posts = sqliteTable("posts", {
  id: id(),
  worldId: worldRef(),
  authorType: text("author_type").notNull(), // brand | ambient
  ambientAuthor: text("ambient_author"),
  proposalId: text("proposal_id"),
  banditArmId: text("bandit_arm_id"),
  archetype: text("archetype").notNull(), // education | story | meme | product
  topic: text("topic").notNull(),
  caption: text("caption").notNull(),
  hashtags: text("hashtags", { mode: "json" }).notNull(),
  creativeBrief: text("creative_brief").notNull(),
  imageUrl: text("image_url"),
  scheduledTick: integer("scheduled_tick").notNull(),
  publishedTick: integer("published_tick"),
  status: text("status").notNull().default("scheduled"), // scheduled | published
});

export const engagements = sqliteTable("engagements", {
  id: id(),
  worldId: worldRef(),
  postId: text("post_id").notNull(),
  personaId: text("persona_id").notNull(),
  kind: text("kind").notNull(), // impression | like | comment | save | share | profile_visit | follow
  commentText: text("comment_text"),
  tick: integer("tick").notNull(),
});

export const funnelEvents = sqliteTable("funnel_events", {
  id: id(),
  worldId: worldRef(),
  personaId: text("persona_id").notNull(),
  kind: text("kind").notNull(), // link_click | signup | dm_started | meeting_booked | disqualified
  sourcePostId: text("source_post_id"),
  tick: integer("tick").notNull(),
});

export const dmThreads = sqliteTable("dm_threads", {
  id: id(),
  worldId: worldRef(),
  personaId: text("persona_id").notNull(),
  status: text("status").notNull().default("open"), // open | qualified | disqualified | closed
  turnCount: integer("turn_count").notNull().default(0),
  createdTick: integer("created_tick").notNull(),
});

export const dmMessages = sqliteTable("dm_messages", {
  id: id(),
  threadId: text("thread_id").notNull(),
  sender: text("sender").notNull(), // persona | agent
  text: text("text").notNull(),
  tick: integer("tick").notNull(),
});

export const proposals = sqliteTable("proposals", {
  id: id(),
  worldId: worldRef(),
  kind: text("kind").notNull(), // post | reply | dm_reply
  status: text("status").notNull().default("pending"),
  // pending | approved | edited_approved | rejected | auto_approved | executed | quarantined | expired
  payload: text("payload", { mode: "json" }).notNull(), // kind-specific, see types.ts
  reasoning: text("reasoning").notNull(),
  evidence: text("evidence", { mode: "json" }).notNull(), // { ruleIds, banditArmId, signals }
  predictedEffect: text("predicted_effect", { mode: "json" }).notNull(),
  riskClass: text("risk_class").notNull().default("normal"), // normal | sensitive
  humanReason: text("human_reason"),
  humanEditDiff: text("human_edit_diff", { mode: "json" }),
  createdTick: integer("created_tick").notNull(),
  decidedTick: integer("decided_tick"),
});

export const playbookVersions = sqliteTable("playbook_versions", {
  id: id(),
  worldId: worldRef(),
  version: integer("version").notNull(),
  parentVersion: integer("parent_version"),
  changeSummary: text("change_summary").notNull(),
  authorType: text("author_type").notNull(), // seed | coach | human | rollback
  createdTick: integer("created_tick").notNull(),
});

// full-copy versioning: every version's row-set is complete; diff by ruleKey
export const playbookRules = sqliteTable("playbook_rules", {
  id: id(),
  worldId: worldRef(),
  versionId: text("version_id").notNull(),
  ruleKey: text("rule_key").notNull(), // stable identity across versions
  category: text("category").notNull(), // voice | content | timing | audience | guardrail
  text: text("text").notNull(),
  confidence: real("confidence").notNull().default(0.5),
  evidence: text("evidence", { mode: "json" }).notNull(), // { sourceType: seed|outcome|rejection|edit, refs: string[] }
});

export const banditArms = sqliteTable("bandit_arms", {
  id: id(),
  worldId: worldRef(),
  archetype: text("archetype").notNull(),
  timeSlot: text("time_slot").notNull(), // morning | midday | evening
  alpha: real("alpha").notNull().default(2),
  beta: real("beta").notNull().default(2),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

export const banditObservations = sqliteTable("bandit_observations", {
  id: id(),
  armId: text("arm_id").notNull(),
  postId: text("post_id").notNull(),
  reward: real("reward").notNull(), // 0..1
  tick: integer("tick").notNull(),
});

export const banditSnapshots = sqliteTable("bandit_snapshots", {
  id: id(),
  worldId: worldRef(),
  playbookVersionId: text("playbook_version_id").notNull(),
  armsJson: text("arms_json", { mode: "json" }).notNull(),
});

export const outcomeReports = sqliteTable("outcome_reports", {
  id: id(),
  worldId: worldRef(),
  postId: text("post_id").notNull(),
  windowTicks: integer("window_ticks").notNull(),
  actual: text("actual", { mode: "json" }).notNull(),
  predicted: text("predicted", { mode: "json" }).notNull(),
  verdict: text("verdict").notNull(), // exceeded | met | missed
  attribution: text("attribution", { mode: "json" }).notNull(),
  // analyst's testable lesson candidates — fed to the coach digest (nullable: rows predate the column)
  suggestedLessons: text("suggested_lessons", { mode: "json" }),
  summary: text("summary").notNull(),
  tick: integer("tick").notNull(),
});

export const activityLog = sqliteTable("activity_log", {
  id: id(),
  worldId: worldRef(),
  tick: integer("tick").notNull(),
  actor: text("actor").notNull(), // strategist | copywriter | critic | analyst | coach | community | publisher | human | system
  action: text("action").notNull(),
  refType: text("ref_type"),
  refId: text("ref_id"),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  detail: text("detail", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// NOTE: secrets never live here. This DB is a committed artifact
// (demo-snapshot.db), so the Slack bot token / webhook URL stay in env and only
// the routing target and preferences are stored.
export const settings = sqliteTable("settings", {
  worldId: text("world_id").primaryKey(),
  /** @handle, email, or Uxxxx — who approvals get routed to */
  slackTarget: text("slack_target"),
  /** which notification kinds are on, JSON string[] */
  slackNotify: text("slack_notify", { mode: "json" }),
  slackEnabled: integer("slack_enabled", { mode: "boolean" }).notNull().default(false),
  mode: text("mode").notNull().default("propose"), // propose | autopilot
  maxPostsPerDay: integer("max_posts_per_day").notNull().default(3),
  maxDmsPerDay: integer("max_dms_per_day").notNull().default(5),
  quietHours: text("quiet_hours", { mode: "json" }).notNull(), // [startHour, endHour]
  imageBudget: integer("image_budget").notNull().default(10),
  bannedTopics: text("banned_topics", { mode: "json" }).notNull(),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
});
