import featurefence from "eslint-plugin-featurefence";

export default [
  {
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    plugins: { featurefence },
    rules: {
      "featurefence/no-unsupported-feature": ["warn", {
        mode: "baseline-or-targets",
        targets: [">=0.5%", "last 2 versions", "not dead"]
      }]
    }
  }
];
