export const FFMPEG_CONCAT_OUTPUT_OPTIONS = [
  "-c:v libx264",
  "-preset veryfast",
  "-pix_fmt yuv420p",
  "-c:a aac",
  "-b:a 192k",
  "-movflags +faststart",
];
