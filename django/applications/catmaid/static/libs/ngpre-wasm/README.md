## Build instructions

ngpre-wasm can be built simply with [wasm-pack](https://github.com/rustwasm/wasm-pack).

```sh
git clone https://github.com/aschampion/ngpre-wasm.git
cd ngpre-wasm
wasm-pack build --target web --release
echo "self.ngpre_wasm = wasm_bindgen;" >> pkg/ngpre_wasm.js
cp pkg/ngpre_wasm_bg.wasm $CATMAID_PATH$/django/applications/catmaid/static/libs/ngpre-wasm
cp pkg/ngpre_wasm.js $CATMAID_PATH$/django/applications/catmaid/static/libs/ngpre-wasm
```
