import { Tab, TabUrlVariant } from '../src/types/workspace';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: any, expected: any, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}: expected ${expectedStr}, received ${actualStr}`);
  }
}

// Test replication logic matching duplicateTab in useWorkspace
function simulateDuplicateTab(
  tabs: Tab[],
  tabOrId: string | Tab,
  activeSpaceId: string = 'space_personal'
): Tab | null {
  const tabId = typeof tabOrId === 'string' ? tabOrId : tabOrId?.id;
  const canonicalTab = tabs.find((t) => t.id === tabId);
  const sourceTab = canonicalTab || (typeof tabOrId === 'object' && tabOrId !== null ? tabOrId : null);
  if (!sourceTab) return null;

  let idCounter = 1;
  const generateId = (prefix: string) => `${prefix}_duplicated_${idCounter++}`;

  const clonedVariants =
    sourceTab.urlVariants && sourceTab.urlVariants.length > 0
      ? sourceTab.urlVariants.map((v) => ({
          id: generateId('var'),
          name: v.name,
          url: v.url,
        }))
      : undefined;

  let clonedDefaultVariantId: string | undefined = undefined;
  let targetUrl = sourceTab.url;

  if (clonedVariants && clonedVariants.length > 0) {
    if (sourceTab.defaultVariantId) {
      const origIdx = sourceTab.urlVariants?.findIndex((v) => v.id === sourceTab.defaultVariantId);
      if (origIdx !== undefined && origIdx >= 0 && clonedVariants[origIdx]) {
        clonedDefaultVariantId = clonedVariants[origIdx].id;
        if (clonedVariants[origIdx].url) {
          targetUrl = clonedVariants[origIdx].url;
        }
      }
    }
    if (!clonedDefaultVariantId) {
      clonedDefaultVariantId = clonedVariants[0].id;
      if (clonedVariants[0].url) {
        targetUrl = clonedVariants[0].url;
      }
    }
  }

  return {
    id: generateId('tab'),
    url: targetUrl,
    urlVariants: clonedVariants,
    defaultVariantId: clonedDefaultVariantId,
    customTitle: sourceTab.customTitle,
    customEmojiIcon: sourceTab.customEmojiIcon,
    favIconUrl: sourceTab.favIconUrl,
    pinned: Boolean(sourceTab.pinned),
    favourite: Boolean(sourceTab.favourite),
    parentSpaceId: sourceTab.favourite ? undefined : (sourceTab.parentSpaceId || activeSpaceId),
    parentFolderId: sourceTab.parentFolderId,
    order: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Scenario 1: Tab with URL variables and no variants
const tabWithVariables: Tab = {
  id: 'tab_1',
  url: 'https://{{API_HOST}}:{{PORT}}/v1/users',
  customTitle: 'Users API',
  customEmojiIcon: '👥',
  favIconUrl: 'https://example.com/favicon.ico',
  pinned: false,
  parentSpaceId: 'space_work',
};

const duplicated1 = simulateDuplicateTab([tabWithVariables], 'tab_1');
assertEqual(
  duplicated1?.url,
  'https://{{API_HOST}}:{{PORT}}/v1/users',
  'Duplicated tab must preserve template variables in URL'
);
assertEqual(
  duplicated1?.favIconUrl,
  'https://example.com/favicon.ico',
  'Duplicated tab must preserve favIconUrl'
);
assertEqual(
  duplicated1?.customTitle,
  'Users API',
  'Duplicated tab must preserve customTitle'
);

// Scenario 2: Duplicating when a UI object with a resolved URL is passed
const uiTabWithResolvedUrl: Tab = {
  ...tabWithVariables,
  url: 'https://api.production.internal:8080/v1/users', // Resolved URL from UI
};

const duplicatedFromUI = simulateDuplicateTab([tabWithVariables], uiTabWithResolvedUrl);
assertEqual(
  duplicatedFromUI?.url,
  'https://{{API_HOST}}:{{PORT}}/v1/users',
  'Duplicated tab must look up canonical tab and use original URL with variables instead of resolved URL'
);

// Scenario 3: Tab with URL variables and multiple URL variants
const tabWithVariants: Tab = {
  id: 'tab_2',
  url: 'https://{{DEV_HOST}}/app',
  urlVariants: [
    { id: 'var_prod', name: 'Production', url: 'https://{{PROD_HOST}}/app' },
    { id: 'var_stage', name: 'Staging', url: 'https://{{STAGE_HOST}}/app' },
    { id: 'var_dev', name: 'Dev', url: 'https://{{DEV_HOST}}/app' },
  ],
  defaultVariantId: 'var_dev',
  pinned: true,
  parentSpaceId: 'space_work',
};

const duplicatedVariants = simulateDuplicateTab([tabWithVariants], 'tab_2');
assertEqual(
  duplicatedVariants?.url,
  'https://{{DEV_HOST}}/app',
  'Duplicated tab must preserve default variant template URL with variables'
);
assertEqual(
  duplicatedVariants?.urlVariants?.length,
  3,
  'Duplicated tab must include all variants of the tab'
);
assertEqual(
  duplicatedVariants?.urlVariants?.[0]?.url,
  'https://{{PROD_HOST}}/app',
  'First variant must preserve variables in URL'
);
assertEqual(
  duplicatedVariants?.urlVariants?.[1]?.url,
  'https://{{STAGE_HOST}}/app',
  'Second variant must preserve variables in URL'
);
assertEqual(
  duplicatedVariants?.urlVariants?.[2]?.url,
  'https://{{DEV_HOST}}/app',
  'Third variant must preserve variables in URL'
);
assertEqual(
  duplicatedVariants?.defaultVariantId,
  duplicatedVariants?.urlVariants?.[2]?.id,
  'Duplicated defaultVariantId must map to the corresponding cloned variant ID'
);

// Scenario 4: Tab with a single variant
const tabWithSingleVariant: Tab = {
  id: 'tab_3',
  url: 'https://{{SPECIAL_HOST}}/settings',
  urlVariants: [
    { id: 'var_1', name: 'Default', url: 'https://{{SPECIAL_HOST}}/settings' },
  ],
  defaultVariantId: 'var_1',
  pinned: false,
  favourite: true,
};

const duplicatedSingle = simulateDuplicateTab([tabWithSingleVariant], 'tab_3');
assertEqual(
  duplicatedSingle?.urlVariants?.length,
  1,
  'Tab with single variant must preserve that variant'
);
assertEqual(
  duplicatedSingle?.url,
  'https://{{SPECIAL_HOST}}/settings',
  'Template variable must be preserved'
);

console.log('All tab duplication tests passed successfully!');
