"use client";

import { useId, useState } from "react";
import SettingsSectionForm from "@/components/author/settings/SettingsSectionForm";
import { saveAiPreferences } from "@/features/author/settings/actions";
import {
  AI_REPLY_STYLES,
  AI_TRAIT_LEVELS,
  MAX_ABOUT_CHARS,
  MAX_CRAFT_CHARS,
  MAX_INSTRUCTIONS_CHARS,
  MAX_NICKNAME_CHARS,
  type AiReplyStyle,
  type AiSettings,
  type AiTraitLevel,
} from "./contracts";

const replyStyleLabel: Record<AiReplyStyle, string> = {
  default: "Default",
  concise: "Efficient",
  friendly: "Friendly",
  candid: "Candid",
  encouraging: "Encouraging",
};

const replyStyleHint: Record<AiReplyStyle, string> = {
  default: "Whatever suits the question.",
  concise: "Answer first. No preamble, no recap.",
  friendly: "Warm and conversational, like a colleague reading beside you.",
  candid: "Says plainly what is not working, and why.",
  encouraging: "Names what already works before what to change.",
};

const traitLevelLabel: Record<AiTraitLevel, string> = { less: "Less", standard: "Standard", more: "More" };

const traitRows = [
  { key: "warmth", name: "ai_warmth", label: "Warmth" },
  { key: "enthusiasm", name: "ai_enthusiasm", label: "Enthusiasm" },
  { key: "structure", name: "ai_structure", label: "Headings and lists" },
  { key: "emoji", name: "ai_emoji", label: "Emoji" },
] as const;

function Toggle({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <>
      <label className="relative inline-flex min-h-11 w-12 shrink-0 cursor-pointer items-center">
        <input type="checkbox" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
        <span className={`relative h-7 w-12 rounded-full border border-border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring ${checked ? "bg-primary" : "bg-muted"}`}>
          <span className={`absolute left-1 top-1 h-[18px] w-[18px] rounded-full shadow-sm transition-transform ${checked ? "translate-x-5 bg-primary-foreground" : "bg-muted-foreground"}`} />
        </span>
      </label>
      <input type="hidden" name={name} value={checked ? "true" : "false"} />
    </>
  );
}

/**
 * The AI settings page.
 *
 * Turning AI off must not erase what the author configured, so the detail
 * controls stay mounted and keep posting their values — only their container is
 * hidden. Hiding a control does not exclude it from form submission (only
 * `disabled` does); unmounting them would post blanks and wipe tone, profile and
 * instructions on the way out.
 */
export default function AiSettingsSection({ settings, action = saveAiPreferences }: {
  settings: AiSettings;
  /** Overridden by the /dev fixture so a preview save never hits the account. */
  action?: typeof saveAiPreferences;
}) {
  const [aiEnabled, setAiEnabled] = useState(settings.aiEnabled);
  const [memoryEnabled, setMemoryEnabled] = useState(settings.memoryEnabled);
  const [matchVoice, setMatchVoice] = useState(settings.matchWritingVoice);
  const [replyStyle, setReplyStyle] = useState<AiReplyStyle>(settings.replyStyle);
  const [traits, setTraits] = useState({
    warmth: settings.warmth,
    enthusiasm: settings.enthusiasm,
    structure: settings.structure,
    emoji: settings.emoji,
  });
  const [nickname, setNickname] = useState(settings.nickname);
  const [craft, setCraft] = useState(settings.craft);
  const [about, setAbout] = useState(settings.about);
  const [instructions, setInstructions] = useState(settings.instructions);
  const ids = useId();

  return (
    <SettingsSectionForm
      title="AI"
      description="Verkli’s specialists only ever suggest — you decide what reaches your book. If you would rather write without them, turn AI off completely."
      titleAside={<Toggle name="ai_enabled" checked={aiEnabled} onChange={setAiEnabled} label="Use AI in Verkli" />}
      action={action}
      idleMessage="Applies to every book and every specialist."
      saveLabel="Save AI settings"
    >
      {!aiEnabled && (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
          AI is off once you save. The AI team, the writing assistant, AI editorial review, audiobook narration, translation and campaign video are hidden and will not run — including from an old tab. Your saved tone, profile and instructions are kept, so turning AI back on restores them.
        </p>
      )}

      <div className={aiEnabled ? "space-y-8" : "hidden"}>
        <div className="space-y-2">
          <label htmlFor={`${ids}-style`} className="text-sm font-medium">Style and tone</label>
          <select
            id={`${ids}-style`}
            name="ai_reply_style"
            value={replyStyle}
            onChange={(event) => setReplyStyle(event.target.value as AiReplyStyle)}
            aria-describedby={`${ids}-style-hint`}
            className="input-base min-h-11 text-base sm:max-w-sm sm:text-sm"
          >
            {AI_REPLY_STYLES.map((style) => <option key={style} value={style}>{replyStyleLabel[style]}</option>)}
          </select>
          <p id={`${ids}-style-hint`} className="text-xs text-muted-foreground">{replyStyleHint[replyStyle]} This shapes how your team writes to you — never what it is able to do.</p>
        </div>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Traits</legend>
          <p className="pb-2 text-xs text-muted-foreground">Finer adjustments on top of style and tone.</p>
          {traitRows.map(({ key, name, label }) => (
            <div key={key} className="flex items-center justify-between gap-4 border-t border-border py-2 first:border-t-0">
              <label htmlFor={`${ids}-${key}`} className="text-sm">{label}</label>
              <select
                id={`${ids}-${key}`}
                name={name}
                value={traits[key]}
                onChange={(event) => setTraits((current) => ({ ...current, [key]: event.target.value as AiTraitLevel }))}
                className="input-base h-11 w-32 shrink-0 text-base sm:text-sm"
              >
                {AI_TRAIT_LEVELS.map((level) => <option key={level} value={level}>{traitLevelLabel[level]}</option>)}
              </select>
            </div>
          ))}
        </fieldset>

        <div className="flex items-start justify-between gap-5 border-t border-border pt-6">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Follow my writing voice</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Take rhythm and vocabulary from the manuscript on screen instead of a house style.</p>
          </div>
          <Toggle name="ai_match_writing_voice" checked={matchVoice} onChange={setMatchVoice} label="Follow my writing voice" />
        </div>

        <div className="space-y-5 border-t border-border pt-6">
          <div>
            <h3 className="text-sm font-medium">About you</h3>
            <p className="mt-1 text-sm text-muted-foreground">Shared with every specialist, in every book.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor={`${ids}-nickname`} className="text-sm font-medium">What to call you</label>
              <input id={`${ids}-nickname`} name="ai_nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={MAX_NICKNAME_CHARS} placeholder="Svea" className="input-base min-h-11 text-base sm:text-sm" />
            </div>
            <div className="space-y-2">
              <label htmlFor={`${ids}-craft`} className="text-sm font-medium">What you write</label>
              <input id={`${ids}-craft`} name="ai_craft" value={craft} onChange={(event) => setCraft(event.target.value)} maxLength={MAX_CRAFT_CHARS} placeholder="Historical fiction" className="input-base min-h-11 text-base sm:text-sm" />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor={`${ids}-about`} className="text-sm font-medium">More about you</label>
            <textarea id={`${ids}-about`} name="ai_about" value={about} onChange={(event) => setAbout(event.target.value)} maxLength={MAX_ABOUT_CHARS} rows={3} placeholder="Who you write for, what you care about, anything worth keeping in mind." className="input-base min-h-11 text-base sm:text-sm" />
            <p className="text-xs text-muted-foreground">{about.length}/{MAX_ABOUT_CHARS}</p>
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-6">
          <label htmlFor={`${ids}-instructions`} className="text-sm font-medium">Custom instructions</label>
          <p className="text-sm text-muted-foreground">Standing requests for every conversation. &ldquo;Never rewrite dialogue&rdquo;, &ldquo;always suggest three alternatives&rdquo;, &ldquo;write to me in Swedish&rdquo;.</p>
          <textarea id={`${ids}-instructions`} name="ai_instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={MAX_INSTRUCTIONS_CHARS} rows={4} className="input-base min-h-11 text-base sm:text-sm" />
          <p className="text-xs text-muted-foreground">{instructions.length}/{MAX_INSTRUCTIONS_CHARS}</p>
        </div>

        <div className="flex items-start justify-between gap-5 border-t border-border pt-6">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Memory</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Let specialists use the preferences you saved while working on a book. Verkli never infers memories from your conversations — you write each one yourself, and you can read and delete them from Team memory in any AI panel.
            </p>
          </div>
          <Toggle name="ai_memory_enabled" checked={memoryEnabled} onChange={setMemoryEnabled} label="Use my saved preferences" />
        </div>
      </div>
    </SettingsSectionForm>
  );
}
