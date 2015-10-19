/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Instance registry test', function( assert ) {
  // Create a new instance registry based type
  var T = function() { this.widgetID = this.registerInstance(); };
  T.prototype = new InstanceRegistry();

  // Test if new instance IDs get assigned as expexted
  var o1 = new T(), o2 = new T(), o3 = new T();
  assert.strictEqual(o1.widgetID, 1, "Assigns 1 as first instance ID");
  assert.strictEqual(o2.widgetID, 2, "Assigns 2 as second instance ID");
  assert.strictEqual(o3.widgetID, 3, "Assigns 3 as third instance ID");
  // Unregister an instance and make sure new instances get lowest ID
  o1.unregisterInstance();
  var o4 = new T();
  assert.strictEqual(o4.widgetID, 1, "Assigns lowest possible instance ID");
});

