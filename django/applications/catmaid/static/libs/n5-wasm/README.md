## Build instructions

This requires the [wasm-chrome-hack](https://github.com/FreeMasen/wasm-chrome-hack) utility.

```sh
cargo +nightly build --release --target wasm32-unknown-unknown
wasm-bindgen target/wasm32-unknown-unknown/release/n5_wasm.wasm --browser --out-dir .
../wasm-chrome-hack/target/debug/wbch n5_wasm.js
cp n5_wasm_bg.wasm $CATMAID_PATH$/django/applications/catmaid/static/libs/n5-wasm
cp n5_wasm.ch.js $CATMAID_PATH$/django/applications/catmaid/static/libs/n5-wasm
```

Then edit the `fetch` line in `n5_wasm.ch.js` to:

	fetch(CATMAID.makeStaticURL('libs/n5-wasm/n5_wasm_bg.wasm'))
