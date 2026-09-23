import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NoDownloadAudioPlayer from "./NoDownloadAudioPlayer";

describe("audiobook controls", () => {
  it("exposes labelled speed and sleep controls without autoplay or downloading", () => {
    const html = renderToStaticMarkup(<NoDownloadAudioPlayer src="/chapter.wav" />);
    expect(html).toContain("Playback speed");
    expect(html).toContain("Sleep timer");
    expect(html).toContain("30 minutes");
    expect(html).toContain('value="1.5"');
    expect(html).toContain('controlsList="nodownload noplaybackrate"');
    expect(html).not.toContain("autoPlay");
  });
});
