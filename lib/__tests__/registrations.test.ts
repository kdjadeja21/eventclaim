import { describe, expect, it } from "vitest";
import {
  classifyTeamIntent,
  parseTeamAnswer,
  resolveEffectiveTicketCategory,
} from "@/lib/registrations";

describe("parseTeamAnswer", () => {
  it("treats empty as individual", () => {
    const r = parseTeamAnswer("", "self@example.com");
    expect(r.isIndividual).toBe(true);
    expect(r.rawQuality).toBe("empty");
  });

  it("treats Individual keyword as individual", () => {
    const r = parseTeamAnswer("Individual", "self@example.com");
    expect(r.isIndividual).toBe(true);
    expect(r.rawQuality).toBe("individual_keyword");
  });

  it("filters self-email from create answers", () => {
    const r = parseTeamAnswer("self@example.com", "self@example.com");
    expect(r.isIndividual).toBe(true);
    expect(r.rawQuality).toBe("self_only");
  });

  it("parses comma-separated member emails", () => {
    const r = parseTeamAnswer("a@example.com, b@example.com", "lead@example.com");
    expect(r.teamEmails).toEqual(["a@example.com", "b@example.com"]);
    expect(r.rawQuality).toBe("valid");
  });

  it("classifies garbage text", () => {
    const r = parseTeamAnswer("No I am student", "s@example.com");
    expect(r.isIndividual).toBe(true);
    expect(r.rawQuality).toBe("garbage");
  });
});

describe("classifyTeamIntent", () => {
  it("create + members → lead", () => {
    const parsed = parseTeamAnswer("a@example.com,b@example.com", "lead@example.com");
    const intent = classifyTeamIntent("create_team", parsed);
    expect(intent.kind).toBe("lead");
    expect(intent.referencedEmails).toHaveLength(2);
  });

  it("join + single email → member", () => {
    const parsed = parseTeamAnswer("lead@example.com", "mem@example.com");
    const intent = classifyTeamIntent("join_team", parsed);
    expect(intent.kind).toBe("member");
  });

  it("join + multiple emails → lead with ticket_mismatch", () => {
    const parsed = parseTeamAnswer(
      "a@example.com,b@example.com,c@example.com",
      "wrong@example.com"
    );
    const intent = classifyTeamIntent("join_team", parsed);
    expect(intent.kind).toBe("lead");
  });

  it("create + garbage → individual", () => {
    const parsed = parseTeamAnswer("No I am student", "s@example.com");
    const intent = classifyTeamIntent("create_team", parsed);
    expect(intent.kind).toBe("individual");
  });
});

describe("resolveEffectiveTicketCategory", () => {
  it("reclassifies individual create to find_team", () => {
    const parsed = parseTeamAnswer("Individual", "solo@example.com");
    const intent = classifyTeamIntent("create_team", parsed);
    expect(resolveEffectiveTicketCategory("create_team", intent)).toBe("find_team");
  });
});
