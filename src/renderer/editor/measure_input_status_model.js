function getMeasureInputStatusDisplay(result) {
  if (!result) {
    return {
      ariaLabel: "Measure fill is unavailable here",
      state: "unavailable",
      text: "Measure -",
      title: "Move the cursor to music with a defined M: and L: to check the measure fill.",
    };
  }
  return {
    ariaLabel: `${result.text}: ${result.state}`,
    state: result.state,
    text: result.text,
    title: result.duration
      ? `${result.text}: ${result.state}; expected ${result.duration.expected} (M:${result.meter})`
      : `${result.text}: ${result.state}; M:${result.meter}, L:${result.defaultLength}`,
  };
}

export { getMeasureInputStatusDisplay };
