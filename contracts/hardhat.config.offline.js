// Offline variant of the main config: compiles with the solc-js binary from
// node_modules instead of downloading one, for sandboxes with no access to
// binaries.soliditylang.org. Usage:
//   npx hardhat --config hardhat.config.offline.js test
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === "0.8.24") {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: "0.8.24",
      longVersion: require("solc").version().replace(".Emscripten.clang", ""),
    };
  }
  return runSuper(args);
});

module.exports = require("./hardhat.config.js");
