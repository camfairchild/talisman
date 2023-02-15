module.exports = function () {
  return {
    presets: [
      ["@babel/preset-env", { targets: { node: "current" } }],
      "@babel/preset-react",
      "@babel/preset-typescript",
    ],
    plugins: [["@babel/plugin-proposal-decorators", { legacy: true }]],
  }
}