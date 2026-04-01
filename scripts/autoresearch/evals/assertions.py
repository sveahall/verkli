"""
Binary assertions for prompt evaluation.

Each function takes (response: str, test_case: dict) and returns bool.
Add your own assertions to the ASSERTIONS list at the bottom.
"""

import re


def _normalize(text: str) -> str:
    """Normalize smart quotes/apostrophes to ASCII equivalents."""
    return text.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')


def assert_empathy_opener(response: str, test_case: dict) -> bool:
    """Response should open with an empathetic acknowledgment."""
    lower = _normalize(response.lower()[:200])
    # Check exact substring matches
    empathy_phrases = [
        "i understand",
        "i appreciate",
        "thank you for",
        "that must be",
        "i can see",
        "i hear you",
        "that's wonderful",
        "that's great",
        "glad to hear",
    ]
    if any(phrase in lower for phrase in empathy_phrases):
        return True
    # "sorry" with optional intensifiers: "i'm sorry", "i'm so sorry", "i'm truly sorry"
    if re.search(r"i'm\s+(?:\w+\s+)?sorry", lower):
        return True
    return False


def assert_concise(response: str, test_case: dict) -> bool:
    """Response should be under 200 words."""
    return len(response.split()) <= 200


def assert_actionable(response: str, test_case: dict) -> bool:
    """Response should contain a clear next step or action."""
    lower = response.lower()
    action_signals = [
        "please",
        "you can",
        "i recommend",
        "next step",
        "contact us",
        "try",
        "go to",
        "click",
        "visit",
        "here's what",
        "to resolve",
        "feel free",
        "let me know",
        "reach out",
        "don't hesitate",
    ]
    return any(signal in lower for signal in action_signals)


def assert_no_invented_policy(response: str, test_case: dict) -> bool:
    """Response must not cite made-up policies or guarantees."""
    lower = _normalize(response.lower())
    # Hard prohibitions — these are always bad
    hard_prohibit = [
        "100% guarantee",
        "our policy states",
        "as per our policy",
        "money-back guarantee",
        "we guarantee",
        "our policy is",
        "company policy",
    ]
    if any(phrase in lower for phrase in hard_prohibit):
        return False
    # "we always" / "we never" — only bad when making promises (not in casual phrasing)
    if re.search(r"we always (ensure|provide|offer|strive|guarantee|deliver|make sure)", lower):
        return False
    if re.search(r"we never (charge|refuse|ignore|compromise)", lower):
        return False
    return True


def assert_no_hallucinated_contact(response: str, test_case: dict) -> bool:
    """Response must not invent specific emails, phone numbers, or URLs."""
    # Fake phone numbers
    if re.search(r"1-800-\d{3}-\d{4}", response):
        return False
    # Fake emails (support@example.com is OK as clearly fake)
    if re.search(r"\b\w+@(?!example\.com)\w+\.\w+", response):
        return False
    # Fake URLs with specific paths
    if re.search(r"https?://(?!example\.com)\S+\.\S+/\S+", response):
        return False
    return True


def assert_no_specific_prices(response: str, test_case: dict) -> bool:
    """Response must not invent specific prices or dollar amounts."""
    return not re.search(r"\$\d+", response)


def assert_no_specific_timeframes(response: str, test_case: dict) -> bool:
    """Response should not promise exact business day timelines (e.g. '3-5 business days')."""
    return not re.search(r"\d+[-–]\d+\s*business\s*days", response.lower())


def assert_tone_match(response: str, test_case: dict) -> bool:
    """Response tone should match the situation:
    - angry/frustrated customers: no exclamation marks, no overly cheerful language
    - positive customers: can be warmer
    """
    tone = test_case.get("metadata", {}).get("tone", "neutral")
    lower = response.lower()

    if tone in ("angry", "frustrated"):
        # Should not be overly cheerful
        cheerful = ["great!", "awesome!", "wonderful!", "fantastic!", "excited"]
        return not any(word in lower for word in cheerful)
    return True


def assert_stays_in_role(response: str, test_case: dict) -> bool:
    """Response must not break character or reference being an AI/LLM."""
    lower = response.lower()
    breaks = [
        "as an ai",
        "as a language model",
        "i'm an ai",
        "i am an ai",
        "i don't have access to",
        "i cannot access",
        "as a chatbot",
        "i'm a virtual",
    ]
    return not any(phrase in lower for phrase in breaks)


def assert_no_over_apologizing(response: str, test_case: dict) -> bool:
    """Response should not apologize more than twice — over-apologizing feels insincere."""
    lower = response.lower()
    apology_count = lower.count("sorry") + lower.count("apologize") + lower.count("apologies")
    return apology_count <= 2


def assert_single_response(response: str, test_case: dict) -> bool:
    """Response should be a single coherent reply, not multiple alternatives or options lists."""
    # Detect if model outputs multiple "versions" or "options" of a response
    option_markers = ["option 1", "option 2", "alternative 1", "version 1", "response 1"]
    lower = response.lower()
    return not any(marker in lower for marker in option_markers)


# ── Register all assertions here ──────────────────────────────────────────────

ASSERTIONS = [
    assert_empathy_opener,
    assert_concise,
    assert_actionable,
    assert_no_invented_policy,
    assert_no_hallucinated_contact,
    assert_no_specific_prices,
    assert_no_specific_timeframes,
    assert_tone_match,
    assert_stays_in_role,
    assert_no_over_apologizing,
    assert_single_response,
]
