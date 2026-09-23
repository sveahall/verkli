import { describe, expect, it } from "vitest";
import {
  readRightsAttestation,
  RIGHTS_WORDING,
  RIGHTS_WORDING_VERSION,
  PRIOR_PUBLICATION_DETAIL_MAX,
} from "./attestation";

/**
 * The parser is the gate. Everything else is storage.
 *
 * The neighbouring `parseImportMode` turns an absent value into a valid default
 * (`scoped-import.ts`: `rawMode === "" ? "new_version" : null`). If that habit
 * were copied here, an omitted checkbox would read as agreement — and an
 * attestation that defaults to "yes" is not an attestation.
 */

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const AFFIRMED = {
  attestHoldsRights: "true",
  attestIsOwnWork: "true",
  attestConsequences: "true",
};

describe("readRightsAttestation", () => {
  it("accepts a fully affirmed attestation with no prior publication", () => {
    const result = readRightsAttestation(
      form({ ...AFFIRMED, attestPreviouslyPublished: "no" })
    );
    expect(result).toEqual({
      ok: true,
      value: {
        holdsRights: true,
        isOwnWork: true,
        consequencesAcknowledged: true,
        previouslyPublished: false,
        priorPublicationDetail: null,
      },
    });
  });

  it("accepts a prior publication with detail", () => {
    const result = readRightsAttestation(
      form({
        ...AFFIRMED,
        attestPreviouslyPublished: "yes",
        attestPriorPublicationDetail: "Bonnier, 2019, Swedish edition",
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.previouslyPublished).toBe(true);
    expect(result.value.priorPublicationDetail).toBe("Bonnier, 2019, Swedish edition");
  });

  it("refuses a request with no attestation fields at all", () => {
    const result = readRightsAttestation(form({ mode: "new_version" }));
    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  // THE CASE THAT MATTERS MOST. An <input type="checkbox"> submits the literal
  // string "on" unless a value is set explicitly. If the parser accepted any
  // truthy-looking string, a UI that forgot value="true" would still "work" —
  // and so would a hand-rolled request from anyone who guessed the field names.
  it.each(["on", "1", "yes", "TRUE", "True", "checked", " true"])(
    "does not accept %j as affirmation",
    (value) => {
      const result = readRightsAttestation(
        form({
          attestHoldsRights: value,
          attestIsOwnWork: "true",
          attestConsequences: "true",
          attestPreviouslyPublished: "no",
        })
      );
      expect(result).toEqual({ ok: false, reason: "not_affirmed" });
    }
  );

  it.each([
    ["attestHoldsRights", "rights"],
    ["attestIsOwnWork", "own work"],
    ["attestConsequences", "consequences"],
  ])("refuses when %s is missing", (field) => {
    const fields: Record<string, string> = {
      ...AFFIRMED,
      attestPreviouslyPublished: "no",
    };
    delete fields[field];
    const result = readRightsAttestation(form(fields));
    expect(result).toEqual({ ok: false, reason: "not_affirmed" });
  });

  it.each([
    ["attestHoldsRights"],
    ["attestIsOwnWork"],
    ["attestConsequences"],
  ])("refuses when %s is explicitly false", (field) => {
    const result = readRightsAttestation(
      form({ ...AFFIRMED, attestPreviouslyPublished: "no", [field]: "false" })
    );
    expect(result).toEqual({ ok: false, reason: "not_affirmed" });
  });

  // Omission is not "no". An author who never answered has disclosed nothing,
  // and storing that as "not previously published" would be us inventing an
  // assertion they did not make — on the field a rights dispute turns on.
  it("refuses when the publication question is unanswered", () => {
    const result = readRightsAttestation(form(AFFIRMED));
    expect(result).toEqual({ ok: false, reason: "publication_answer_missing" });
  });

  it.each(["", "true", "maybe", "unknown"])(
    "refuses %j as an answer to the publication question",
    (value) => {
      const result = readRightsAttestation(
        form({ ...AFFIRMED, attestPreviouslyPublished: value })
      );
      expect(result).toEqual({ ok: false, reason: "publication_answer_missing" });
    }
  );

  it("refuses a prior publication with no detail", () => {
    const result = readRightsAttestation(
      form({ ...AFFIRMED, attestPreviouslyPublished: "yes" })
    );
    expect(result).toEqual({ ok: false, reason: "publication_detail_missing" });
  });

  it("treats whitespace-only detail as missing", () => {
    const result = readRightsAttestation(
      form({
        ...AFFIRMED,
        attestPreviouslyPublished: "yes",
        attestPriorPublicationDetail: "   \n  ",
      })
    );
    expect(result).toEqual({ ok: false, reason: "publication_detail_missing" });
  });

  it("caps the free-text detail rather than accepting an unbounded write", () => {
    const result = readRightsAttestation(
      form({
        ...AFFIRMED,
        attestPreviouslyPublished: "yes",
        attestPriorPublicationDetail: "x".repeat(PRIOR_PUBLICATION_DETAIL_MAX + 1),
      })
    );
    expect(result).toEqual({ ok: false, reason: "publication_detail_too_long" });
  });

  it("accepts detail at exactly the cap", () => {
    const result = readRightsAttestation(
      form({
        ...AFFIRMED,
        attestPreviouslyPublished: "yes",
        attestPriorPublicationDetail: "x".repeat(PRIOR_PUBLICATION_DETAIL_MAX),
      })
    );
    expect(result.ok).toBe(true);
  });

  // A stale textarea value must not end up attached to a "no" — the record
  // would then carry a publication detail for a book declared unpublished.
  it("drops the detail when the answer is no", () => {
    const result = readRightsAttestation(
      form({
        ...AFFIRMED,
        attestPreviouslyPublished: "no",
        attestPriorPublicationDetail: "left over from switching the radio back",
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.priorPublicationDetail).toBeNull();
  });
});

describe("wording", () => {
  it("is versioned, so a later stronger wording cannot claim to have been agreed", () => {
    expect(RIGHTS_WORDING_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("carries a sentence for every question the parser enforces", () => {
    expect(Object.keys(RIGHTS_WORDING).sort()).toEqual([
      "consequences",
      "holdsRights",
      "isOwnWork",
      "previouslyPublished",
    ]);
    for (const sentence of Object.values(RIGHTS_WORDING)) {
      expect(sentence.length).toBeGreaterThan(20);
    }
  });

  // The consequence wording was chosen deliberately over a weaker, already-true
  // alternative, and it commits us to a Terms clause granting the right to end a
  // single project. If someone softens the sentence, the version must move with
  // it so old records keep the text they were actually shown.
  it("states the consequence the terms must grant", () => {
    expect(RIGHTS_WORDING.consequences).toContain("end this project");
    expect(RIGHTS_WORDING.consequences).toContain("close my account");
  });
});
