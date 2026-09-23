"""
Binary assertions for prompt evaluation.

Each function takes (response: str, test_case: dict) and returns bool.
Add your own assertions to the ASSERTIONS list at the bottom.
"""


def assert_empathy_opener(response: str, test_case: dict) -> bool:
    """Response should open with an empathetic acknowledgment."""
    lower = response.lower()[:200]
    empathy_phrases = [
        "i understand",
        "i'm sorry",
        "i appreciate",
        "thank you for",
        "that must be",
        "i can see",
        "i hear you",
    ]
    return any(phrase in lower for phrase in empathy_phrases)


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
    ]
    return any(signal in lower for signal in action_signals)


def assert_no_invented_policy(response: str, test_case: dict) -> bool:
    """Response must not cite made-up policies or guarantees."""
    prohibited = [
        "100% guarantee",
        "our policy states",
        "as per our policy",
        "money-back guarantee",
        "we always",
        "we never",
    ]
    lower = response.lower()
    return not any(phrase in lower for phrase in prohibited)


# ── Register all assertions here ──────────────────────────────────────────────
# Add or remove functions as needed for your use case.

ASSERTIONS = [
    assert_empathy_opener,
    assert_concise,
    assert_actionable,
    assert_no_invented_policy,
]
