/**
 * Carrying the letter case of what was matched over to what replaces it.
 *
 * A case-insensitive search for "johan" finds "Johan", "JOHAN" and "johan", and
 * the author asked for all three to change. Asking the model to emit a separate
 * replacement per casing works until it forgets, and then a chapter heading
 * reads "Jonas" in the middle of a line of capitals. Doing it here makes it a
 * property of the operation instead of a hope about the model.
 *
 * Only two patterns are unambiguous enough to transfer: all capitals, and a
 * single leading capital. Everything else keeps the casing the model wrote,
 * including an all-lowercase match — deliberately. A lowercase "johan" in a
 * Swedish manuscript is a typo, and renaming the character is a chance to fix
 * it rather than faithfully reproduce it; while a genuinely lowercase word
 * ("färja" → "båt") is already lowercase in what the model wrote, so it comes
 * out right either way.
 */

const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const LETTER = /\p{L}/u;

function letters(value: string): string[] {
  return Array.from(value).filter((character) => LETTER.test(character));
}

export function transferCasing(matched: string, replacement: string): string {
  const matchedLetters = letters(matched);
  if (matchedLetters.length < 2 || !letters(replacement).length) return replacement;

  const allUpper = matchedLetters.every((character) => UPPER.test(character));
  if (allUpper) return replacement.toUpperCase();

  const [first, ...rest] = matchedLetters;
  const titleCase = UPPER.test(first) && rest.every((character) => LOWER.test(character));
  if (!titleCase) return replacement;

  // Raise the first letter wherever it is, so a replacement opening with a
  // quotation mark or a digit still gets its letter raised — and touch nothing
  // else. Lowercasing the rest first made this destroy every capital past the
  // first: renaming a character from "Johan" to "Erik Nilsson", an ordinary
  // request, wrote "Erik nilsson" at every match. The model already wrote the
  // replacement the way it belongs; only its opening is ours to decide.
  const characters = Array.from(replacement);
  const index = characters.findIndex((character) => LETTER.test(character));
  characters[index] = characters[index].toUpperCase();
  return characters.join("");
}
