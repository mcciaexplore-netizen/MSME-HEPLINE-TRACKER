// Zoho fields that must all be filled for a Done ticket to count as "Data filled".
// Add the newer feedback fields here once they become mandatory.
export const CORE_FIELDS = [
  "Recording Link for Consultation",
  "Rate the solution/ recommendation",
  "Internal Rating for Consultation",
  "Meeting Duration.",
  "Presentation /Transcript /Summary /Content Sent ?",
  "Personalized Creative Sent ?",
  "Level of Consultation",
  "Meeting Query",
  "Meeting Solution",
] as const;

// Feedback fields tracked (as filled/empty flags) so they can be promoted into CORE_FIELDS later
// without re-uploading old exports.
export const OPTIONAL_FIELDS = [
  "Did the client get clear next step?",
  "Was anything left unanswered?",
  "Would the client recommend helpline?",
] as const;

// Zoho fills untouched picklists with "None"; treat it like a blank.
export const EMPTY_PLACEHOLDERS = ["none"];

// Dialer columns used for the calls / scheduling analysis. Header matching ignores case, spaces and
// punctuation; each column also accepts the alternative names listed (from the full dialer export).
export const DIALER_COLUMNS = {
  Direction: ["Direction"],
  Status: ["Status", "Call Status"],
  Time: ["Time", "Call Start Time"],
  "Answered By Agent": ["Answered By Agent", "Answered By"],
  "Missed By Agent": ["Missed By Agent", "Missed By Agent(s)", "Missed By Agents", "Missed By"],
  "Conversation Duration": ["Conversation Duration"],
  "Call ID": ["Call ID"], // optional; used to match re-uploads when present
} as const;
export type DialerColumn = keyof typeof DIALER_COLUMNS;
export const DIALER_REQUIRED: DialerColumn[] = ["Direction", "Status", "Time", "Answered By Agent", "Missed By Agent", "Conversation Duration"];

export const ZOHO_REQUIRED = [
  "Request Id",
  "Status",
  "Created Time",
  "Due Date",
  "Modified Time",
  "lastName(Created By)",
  "lastName(Ticket Owner)",
  ...CORE_FIELDS,
] as const;

// Fixed shift used for working hours: every day a coordinator handles calls counts as one full shift.
export const SHIFT_START_HOUR = 10; // 10 am
export const SHIFT_END_HOUR = 18; // 6 pm
export const SHIFT_HOURS = SHIFT_END_HOUR - SHIFT_START_HOUR;

// Share of coordinators who are on calls (scheduling) on a given day; the other half run meetings.
// The team's conversation per working hour divides talk time by this share of the coordinators' shift hours.
export const CALLING_SHARE = 0.5;

export const MATCH_THRESHOLD = 0.9;
export const MATCH_MARGIN = 0.05;
