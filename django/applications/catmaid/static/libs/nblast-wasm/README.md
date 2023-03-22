## Build instructions

nblast-wasm can be built simply with [wasm-pack](https://github.com/rustwasm/wasm-pack).

```sh
git clone https://github.com/clbarnes/nblast-rs.git
cd nblast-rs/nblast-js
make pkg
cp pkg/nblast_js_bg.wasm $CATMAID_PATH/django/applications/catmaid/static/libs/nblast-wasm
cp pkg/nblast_js.js $CATMAID_PATH/django/applications/catmaid/static/libs/nblast-wasm
echo "self.nblast_wasm = wasm_bindgen;" >> $CATMAID_PATH/django/applications/catmaid/static/libs/nblast-wasm/nblast_js.js
```
