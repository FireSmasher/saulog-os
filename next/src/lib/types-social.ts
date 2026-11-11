// Row types for the tables in supabase/social-setup.sql (smart reminders and the friend crew).
// Dates are 'YYYY-MM-DD' strings, times 'HH:MM', timestamps ISO strings, ids uuid strings.
// Keep in step with the SQL: a column added there gets added here.

export type Uuid = string
export type IsoDate = string // 'YYYY-MM-DD'
export type IsoTime = string // 'HH:MM'
export type Timestamp = string // ISO 8601

export type Profile = {
  user_id: Uuid
  display_name: string // 1 to 40 characters
  avatar_url: string | null
  created_at: Timestamp
}

export type PlanChoice = 'nippard' | 'full_body_3' | 'push_pull_legs' | 'custom'

export type UserSettings = {
  user_id: Uuid
  timezone: string // IANA name, default 'Europe/Berlin'
  savage_mode: boolean
  kcal_target: number | null
  protein_target: number | null
  plan_choice: PlanChoice | null
  custom_plan_id: Uuid | null
  updated_at: Timestamp
}

export type CustomPlanExercise = { exercise: string; muscle?: string; sets?: number; reps?: string }
export type CustomPlanDay = { name: string; exercises: CustomPlanExercise[] }

export type CustomPlan = {
  id: Uuid
  user_id: Uuid
  name: string // 1 to 60 characters
  days: CustomPlanDay[] // stored as jsonb; the shape is the app's choice
  created_at: Timestamp
  updated_at: Timestamp
}

export type Crew = {
  id: Uuid
  name: string // 1 to 40 characters
  invite_code: string // 12 characters, A-Z and 2-9 without O, I, 0, 1
  created_by: Uuid
  created_at: Timestamp
}

export type CrewRole = 'owner' | 'member'

export type CrewMember = {
  crew_id: Uuid
  user_id: Uuid
  role: CrewRole
  joined_at: Timestamp
}

export const MAX_CREW_MEMBERS = 10

export const ACTIVITY_KINDS = ['walk', 'run', 'bike', 'row', 'stairs', 'other'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]
export type ActivitySource = 'manual' | 'health'

export type ActivityLog = {
  id: Uuid
  user_id: Uuid
  date: IsoDate
  time: IsoTime
  kind: ActivityKind
  minutes: number | null
  distance_km: number | null
  steps: number | null
  source: ActivitySource
  created_at: Timestamp
}

export type NotificationEvent = {
  id: Uuid
  user_id: Uuid
  sent_at: Timestamp
  goal: string // e.g. meals, workout, walk, streak saver; free text, set by the nudge function
  template_id: string
  savage: boolean
  opened_at: Timestamp | null // the only column the app may update
  logged_after: boolean | null
  created_at: Timestamp
}

export type WidgetToken = {
  user_id: Uuid
  token_hash: string // sha256 hex of the token; the plain token is never stored
  created_at: Timestamp
}

// Tables a kudos or comment can point at.
export const SOCIAL_TARGET_TABLES = ['food_logs', 'workout_logs', 'activity_logs', 'health_logs'] as const
export type SocialTargetTable = (typeof SOCIAL_TARGET_TABLES)[number]

export type Kudos = {
  id: Uuid
  from_user: Uuid
  target_table: SocialTargetTable
  target_id: Uuid
  target_owner: Uuid // set by the database, never sent by the app
  created_at: Timestamp
}

export const COMMENT_MAX = 500

export type Comment = {
  id: Uuid
  author: Uuid
  target_table: SocialTargetTable
  target_id: Uuid
  target_owner: Uuid // set by the database; this person may delete the comment too
  body: string // 1 to 500 characters
  created_at: Timestamp
}

export type FriendNudge = {
  id: Uuid
  from_user: Uuid
  to_user: Uuid
  date: IsoDate // one per pair per day
  created_at: Timestamp
}

export const CHALLENGE_KINDS = ['train_x', 'protein_x', 'move_minutes', 'log_meals'] as const
export type ChallengeKind = (typeof CHALLENGE_KINDS)[number]

export type Challenge = {
  id: Uuid
  crew_id: Uuid
  kind: ChallengeKind
  goal_number: number
  starts: IsoDate
  ends: IsoDate // at most 62 days after starts
  created_by: Uuid
  created_at: Timestamp
}

export type ChallengeMember = {
  challenge_id: Uuid
  user_id: Uuid
  joined_at: Timestamp
}

export const FREEZE_XP_COST = 200

export type FreezePurchase = {
  id: Uuid
  user_id: Uuid
  date: IsoDate // one per person per day
  xp_cost: number
  created_at: Timestamp
}

// Insert shapes: what the app sends. Defaults (id, user_id = auth.uid(), created_at,
// target_owner) are filled by the database.
export type NewActivityLog = Pick<ActivityLog, 'date' | 'time' | 'kind'> &
  Partial<Pick<ActivityLog, 'minutes' | 'distance_km' | 'steps' | 'source'>>
export type NewKudos = Pick<Kudos, 'target_table' | 'target_id'>
export type NewComment = Pick<Comment, 'target_table' | 'target_id' | 'body'>
export type NewFriendNudge = Pick<FriendNudge, 'to_user'> & Partial<Pick<FriendNudge, 'date'>>
export type NewChallenge = Pick<Challenge, 'crew_id' | 'kind' | 'goal_number' | 'starts' | 'ends'>

// supabase.rpc names and their argument and return types.
export type SocialRpc = {
  create_crew: { args: { crew_name: string }; returns: string } // invite code
  join_crew: { args: { code: string }; returns: Uuid } // crew id
  create_widget_token: { args: Record<string, never>; returns: string } // plain token, shown once
}
