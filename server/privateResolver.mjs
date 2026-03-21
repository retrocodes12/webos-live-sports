export async function loadPrivateResolverModule() {
  try {
    const localModule = await import('./privateResolver.local.mjs');
    if (
      typeof localModule.loadPrivateCatalog === 'function' ||
      typeof localModule.resolvePrivateStreams === 'function'
    ) {
      return {
        module: localModule,
        source: 'local',
      };
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Cannot find module')) {
      throw error;
    }
  }

  const templateModule = await import('./privateResolver.template.mjs');
  return {
    module: templateModule,
    source: 'template',
  };
}
