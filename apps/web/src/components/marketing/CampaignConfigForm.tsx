import type { CampaignConfig, CampaignTone } from "@/lib/marketing/types";

const TONE_OPTIONS: CampaignTone[] = ["inspiring", "playful", "direct"];

type CampaignConfigFormProps = {
  value: CampaignConfig;
  onChange: (next: CampaignConfig) => void;
};

export default function CampaignConfigForm({
  value,
  onChange,
}: CampaignConfigFormProps) {
  return (
    <section className="card-base p-5">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Campaign Config</h2>
        <p className="text-[13px] text-slate-500 dark:text-white/50">
          Set the brief used by generation when enabled.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-white/60">
            Objective
          </label>
          <textarea
            className="input-base min-h-[112px] resize-y"
            value={value.objective}
            onChange={(event) => onChange({ ...value, objective: event.target.value })}
            placeholder="Example: Drive preorder signups this week."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-white/60">
              Tone
            </label>
            <select
              className="input-base"
              value={value.tone}
              onChange={(event) =>
                onChange({ ...value, tone: event.target.value as CampaignTone })
              }
            >
              {TONE_OPTIONS.map((tone) => (
                <option key={tone} value={tone}>
                  {tone.charAt(0).toUpperCase() + tone.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-white/60">
              Call to Action
            </label>
            <input
              className="input-base"
              value={value.callToAction}
              onChange={(event) => onChange({ ...value, callToAction: event.target.value })}
              placeholder="Read chapter one now"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-slate-700 dark:text-white/80">
          <input
            type="checkbox"
            checked={value.includeHashtags}
            onChange={(event) =>
              onChange({ ...value, includeHashtags: event.target.checked })
            }
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-white/20 dark:bg-transparent dark:text-white"
          />
          Include hashtags
        </label>
      </div>
    </section>
  );
}
