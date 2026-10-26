import jaroWinkler from "jaro-winkler";
import { MATCH_MARGIN, MATCH_THRESHOLD } from "./config";

export type Source = "Dialer" | "Zoho";

/** "Neha Agarwal-Extension (+919028014361)" / "aarush+majahan (+91...)" -> "Neha Agarwal" / "aarush majahan" */
export function cleanDialerName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\+/g, " ")
    .replace(/-\s*Extension\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanZohoName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Mapping key: case-insensitive so "Aditi gadgil" and "Aditi Gadgil" share one mapping. */
export const nameKey = (cleaned: string) => cleaned.toLowerCase();

/** "a, b (+91..), c" -> cleaned unique names */
export function splitMissedAgents(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const c = cleanDialerName(part);
    if (c && !out.some((o) => nameKey(o) === nameKey(c))) out.push(c);
  }
  return out;
}

const lettersOnly = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** The part of a raw name compared against coordinators' last names. */
export function comparableLastName(cleaned: string, source: Source): string {
  if (source === "Dialer") {
    const words = cleaned.split(" ").filter(Boolean);
    return lettersOnly(words[words.length - 1] ?? "");
  }
  return lettersOnly(cleaned);
}

export interface CandidateCoordinator {
  id: number;
  fullName: string;
  lastName: string;
}

export interface Suggestion {
  coordinatorId: number;
  fullName: string;
  score: number;
}

export interface MatchResult {
  suggestions: Suggestion[]; // top 3
  preselectId: number | null;
  note: string | null;
}

export function suggestCoordinator(cleaned: string, source: Source, coordinators: CandidateCoordinator[]): MatchResult {
  const target = comparableLastName(cleaned, source);
  const scored = coordinators
    .map((c) => ({ coordinatorId: c.id, fullName: c.fullName, score: target ? jaroWinkler(target, lettersOnly(c.lastName)) : 0 }))
    .sort((a, b) => b.score - a.score);
  const suggestions = scored.slice(0, 3).map((s) => ({ ...s, score: Math.round(s.score * 1000) / 1000 }));
  const best = scored[0];
  const second = scored[1];
  if (!best) return { suggestions, preselectId: null, note: null };

  const bestLast = lettersOnly(coordinators.find((c) => c.id === best.coordinatorId)!.lastName);
  const sharing = coordinators.filter((c) => lettersOnly(c.lastName) === bestLast);
  if (sharing.length > 1) {
    return {
      suggestions,
      preselectId: null,
      note: `${sharing.map((s) => s.fullName).join(" and ")} share the last name "${sharing[0].lastName}", so a last name alone can't tell them apart. Pick the right person.`,
    };
  }
  const clearWinner = best.score >= MATCH_THRESHOLD && (!second || best.score - second.score >= MATCH_MARGIN);
  return { suggestions, preselectId: clearWinner ? best.coordinatorId : null, note: null };
}

/** Resolution at calculation time: coordinator id, "IGNORE", or null (unknown / not yet confirmed). */
export type Resolution = number | "IGNORE" | null;

export interface MappingLike {
  source: string;
  key: string;
  status: string;
  target: string | null;
  coordinatorId: number | null;
}

export function buildResolver(mappings: MappingLike[]) {
  const map = new Map<string, Resolution>();
  for (const m of mappings) {
    if (m.status !== "Confirmed") continue;
    if (m.target === "IGNORE") map.set(`${m.source}|${m.key}`, "IGNORE");
    else if (m.target === "COORDINATOR" && m.coordinatorId != null) map.set(`${m.source}|${m.key}`, m.coordinatorId);
  }
  return (source: Source, key: string): Resolution => (key ? map.get(`${source}|${key}`) ?? null : "IGNORE");
}
