const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve("react-native-svg-transformer"),
};
config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== "svg"),
  sourceExts: [...resolver.sourceExts, "svg"],
  // Le poste d'administration (admin/) et le banc d'essais (tools/) vivent dans
  // ce dépôt mais ne font pas partie de l'application mobile. Sans exclusion,
  // Metro parcourt leurs node_modules et signale des collisions de modules.
  blockList: /[\/\\](?:admin[\/\\](?:node_modules|dist)|tools[\/\\][^\/\\]+[\/\\]node_modules)[\/\\].*/,
};

module.exports = withNativeWind(config, { input: "./global.css" });
