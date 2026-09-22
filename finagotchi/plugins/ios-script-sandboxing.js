// Disables Xcode's user script sandboxing on the app target.
//
// Required because the "Bundle React Native code and images" phase writes
// main.jsbundle into CONFIGURATION_BUILD_DIR, which is not a declared phase
// output — under sandboxing (Xcode 26+ recommended setting) that write fails
// with EPERM and the build breaks. Xcode may re-enable this when applying
// "recommended settings", so this plugin pins it on every prebuild.
module.exports = function withIosScriptSandboxingDisabled(config) {
  const { withXcodeProject } = require('expo/config-plugins');
  return withXcodeProject(config, async (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const buildSettings = configurations[key].buildSettings;
      if (buildSettings && buildSettings.ENABLE_USER_SCRIPT_SANDBOXING) {
        buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }
    return config;
  });
};
