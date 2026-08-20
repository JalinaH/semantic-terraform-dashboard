export function matchesConfiguredWorkflow(name: string, exactNames: string[], patterns: string[]) {
  const normalized = name.trim().toLowerCase();
  if (exactNames.some((candidate) => candidate.trim().toLowerCase() === normalized)) return true;
  return patterns.some((pattern) => globToRegExp(pattern, false).test(name));
}

export function matchesTerraformPath(path: string, patterns: string[]) {
  if (!/\.tf(?:\.json)?$/i.test(path)) return false;
  return patterns.some((pattern) => globToRegExp(pattern, true).test(path));
}

export function globToRegExp(pattern: string, pathAware: boolean) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      const double = pattern[index + 1] === "*";
      if (double && pathAware && pattern[index + 2] === "/") {
        index += 2;
        source += "(?:.*/)?";
      } else {
        if (double) index += 1;
        source += double ? ".*" : pathAware ? "[^/]*" : ".*";
      }
    } else if (character === "?") {
      source += pathAware ? "[^/]" : ".";
    } else {
      source += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`, "i");
}
