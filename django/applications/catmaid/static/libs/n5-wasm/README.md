## Build instructions

n5-wasm can be built simply with [wasm-pack](https://github.com/rustwasm/wasm-pack).

```sh
git clone https://github.com/aschampion/n5-wasm.git
cd n5-wasm
wasm-pack build --target dev --release
cp pkg/n5_wasm_bg.wasm $CATMAID_PATH$/django/applications/catmaid/static/libs/n5-wasm
cp pkg/n5_wasm.js $CATMAID_PATH$/django/applications/catmaid/static/libs/n5-wasm
```
