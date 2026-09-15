import { Environment } from '../types/workspace';

export const ENVIRONMENT_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidEnvironmentVariableName(name: string): boolean {
  return ENVIRONMENT_VARIABLE_NAME_PATTERN.test(name);
}

export function getDefaultEnvironment(): Environment {
  const now = Date.now();
  return { id: 'environment_default', name: 'Default', values: {}, createdAt: now, updatedAt: now };
}

export function normalizeEnvironments(
  variables: string[] | undefined,
  environments: Environment[] | undefined,
): { environmentVariables: string[]; environments: Environment[] } {
  const environmentVariables = Array.from(new Set((variables || []).filter(isValidEnvironmentVariableName)));
  const source = environments && environments.length > 0 ? environments : [getDefaultEnvironment()];
  const seenNames = new Set<string>();
  const normalized = source.map((environment, index) => {
    const baseName = environment.name?.trim() || `Environment ${index + 1}`;
    let name = baseName;
    let suffix = 2;
    while (seenNames.has(name.toLocaleLowerCase())) name = `${baseName} ${suffix++}`;
    seenNames.add(name.toLocaleLowerCase());
    const values: Record<string, string> = {};
    for (const variable of environmentVariables) values[variable] = String(environment.values?.[variable] ?? '');
    return { ...environment, id: environment.id || `environment_${index + 1}`, name, values };
  });
  return { environmentVariables, environments: normalized };
}

/** Resolves a URL template using context-aware escaping. */
export function resolveEnvironmentUrl(template: string, values: Record<string, string>): { url?: string; error?: string } {
  try {
    const matches: string[] = [];
    // URL cannot parse a template placeholder in a hostname, so use valid temporary labels.
    const protectedTemplate = template.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (_match, name) => {
      const index = matches.push(name) - 1;
      return `arcableplaceholder${index}x`;
    });
    const parsed = new URL(protectedTemplate);
    const replace = (input: string, encode: (value: string) => string) =>
      matches.reduce((resolved, name, index) => resolved.replaceAll(`arcableplaceholder${index}x`, encode(values[name] ?? '')), input);

    const rawHostname = replace(parsed.hostname, (value) => value);
    if (!rawHostname || /[/:?#@\s]/.test(rawHostname)) return { error: 'A hostname variable produced an invalid hostname.' };
    parsed.hostname = rawHostname;

    const rawPort = replace(parsed.port, (value) => value);
    if (rawPort && !/^\d+$/.test(rawPort)) return { error: 'A port variable must contain only digits.' };
    parsed.port = rawPort;

    // Preserve intentional path separators while encoding individual non-separator fragments.
    parsed.pathname = replace(parsed.pathname, (value) => value.split('/').map(encodeURIComponent).join('/'));
    parsed.search = replace(parsed.search, encodeURIComponent);
    parsed.hash = replace(parsed.hash, encodeURIComponent);
    if (/arcableplaceholder\d+x/.test(parsed.protocol) || /arcableplaceholder\d+x/.test(parsed.username) || /arcableplaceholder\d+x/.test(parsed.password)) {
      return { error: 'Variables are not supported in URL schemes or credentials.' };
    }
    const url = parsed.toString();
    return { url };
  } catch {
    return { error: 'The resolved URL is invalid.' };
  }
}
