(function(CATMAID) {

  "use strict";

  class WebVRInterface {
    constructor(view, device) {
      this.view = view;
      this.device = device;
      this.controllers = [];
      this.meshColorOff = 0xBBBBBB;
      this.meshColorOn = 0xF4C20D;
      this.boundSelectStart = this.selectStart.bind(this);
      this.boundSelectStop = this.selectStop.bind(this);

      CATMAID.asEventSource(this);
    }

    start() {
      if (!this.device) return false;

      let renderer = this.view.renderer;
      renderer.setAnimationLoop(this.render.bind(this));

      // Setup a rig owning the camera and the standing VR space. Since the pose
      // of the camera is determined by the headset, all navigation is instead
      // applied to this rig. See `VRManager.setPoseTarget`.
      this.rig = new THREE.Group();
      this.view.camera.matrix.decompose(
          this.rig.position,
          this.rig.quaternion,
          this.rig.scale
      );
      // The default scale makes roomscale VR a few nm in extent, which make it
      // seem that the controls are not working in most projects. Initialize
      // scale to the ~10 micron regime for good balance for most EM projects.
      // TODO: infer initial scale from camera effective FOV.
      this.rig.scale.multiplyScalar(10000);
      this.rig.add(this.view.camera);
      this.view.space.scene.add(this.rig);
      this.view.camera.near = 1e-3;

      renderer.vr.enabled = true;
      renderer.vr.setDevice(this.device);
      this.device.requestPresent([{source: renderer.domElement}])
          .then(() => this.trigger(WebVRInterface.EVENT_VR_START))
          .catch((e) => {
            CATMAID.warn('Could not request VR device');
            this.stop();
          });

      for (let i = 0; i < 2; i++) {
        let controller = renderer.vr.getController(i);
        controller.userData.isSelecting = false;
        controller.addEventListener('selectstart', this.boundSelectStart);
        controller.addEventListener('selectend', this.boundSelectStop);

        // Adapted from: https://github.com/stewdio/THREE.VRController
        // This handle length allows the tips of the "controller cursor" to extend
        // just past the end of a Windows Mixed Reality controller.
        const HANDLE_LENGTH = 0.15;
        let
          controllerCursor = new THREE.CylinderGeometry(0.005, 0.03, HANDLE_LENGTH / 2, 32),
          controllerMaterial = new THREE.MeshStandardMaterial({
            color: this.meshColorOff
          }),
          controllerMesh = new THREE.Mesh(controllerCursor, controllerMaterial),
          handleMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, HANDLE_LENGTH, 0.03),
            controllerMaterial
          );
        controllerMaterial.flatShading = true;
        controllerMesh.rotation.x = -Math.PI / 2;
        handleMesh.position.y = -(HANDLE_LENGTH * 2 / 3);
        controllerMesh.add(handleMesh);
        controller.userData.mesh = controllerMesh;
        controller.add(controllerMesh);

        this.rig.add(controller);
        this.controllers[i] = controller;
      }
    }

    stop() {
      if (!this.device) return;

      // Copy the position and orientation of the rig to assign to the camera
      // after exiting VR. This is better than copying the camera position
      // because (a) it makes turning VR on and off idempotent on the rig/normal
      // camera position and (b) the VR camera moves with the headset when it
      // is taken off, which would end up looking at the floor.
      //
      // Scale is not copied because the normal 3D viewer does not alter scale.
      // This could be changed to mimic the scale with the camera FOV and zoom.
      //
      // Use a temporary object to copy this pose because Three.js tends to
      // obliterate other pose information when exiting VR.
      let copyCam = new THREE.Object3D();
      this.rig.getWorldPosition(copyCam.position);
      this.rig.getWorldQuaternion(copyCam.quaternion);

      this.device.exitPresent()
          .then(() => {
            this.view.renderer.vr.enabled = false;
            // According to docs one should do this, but with Three.js r95 it
            // causes an error (because this promise is called before
            // VRManager's teardown event):
            // this.view.renderer.vr.setAnimationLoop(null);

            this.rig.remove(this.view.camera);
            this.view.camera.position.copy(copyCam.position);
            this.view.camera.quaternion.copy(copyCam.quaternion);
            this.view.camera.updateMatrix();
            this.view.camera.updateMatrixWorld();
            this.view.space.scene.remove(this.rig);

            for (let controller of this.controllers) {
              controller.removeEventListener('selectstart', this.boundSelectStart);
              controller.removeEventListener('selectstop', this.boundSelectStop);
              controller.userData = {};
            }
            this.controllers = [];

            this.view.initRenderer();
            this.view.space.render();

            this.trigger(WebVRInterface.EVENT_VR_END);
          });
    }

    selectStart(event) {
      let controller = event.target;
      if (!controller.userData.isSelecting) {
        controller.userData.isSelecting = true;
        controller.userData.mesh.material.color.setHex(this.meshColorOn);
        controller.userData.lastPosition = controller.position.clone();
        controller.userData.lastQuaternion = controller.quaternion.clone();
        controller.userData.lastUp = controller.up.clone();
      }
    }

    selectStop(event) {
      let controller = event.target;
      controller.userData.isSelecting = false;
      controller.userData.mesh.material.color.setHex(this.meshColorOff);
    }

    render() {
      let selectingControllers = this.controllers.filter(c => c.userData.isSelecting);

      // TODO: Once controller buttons can be distinguished, these navigation
      // controls should be mapped to grip buttons rather than triggers, which
      // should be reserved for selection and other interactions.

      if (selectingControllers.length == 1) {
        // One-controller navigation: translate only.
        // Transformation fitting is not used here so this method is less noisy
        // and therefore more comfortable for most navigation.

        let movingController = selectingControllers[0];
        let delta = movingController.userData.lastPosition.sub(movingController.position);

        // For one-controller movement, amplifying the movement makes it feel
        // more comfortable and useful in most contexts, even if less realistic.
        delta.multiplyScalar(2);

        // Use the scaling and rotation of the VR rig.
        this.rig.localToWorld(delta);
        delta.sub(this.rig.position);
        this.rig.position.add(delta);

      } else if (selectingControllers.length == 2) {
        // Two-controller navigation: rotate, translate and uniformly scale the
        // entire scene, so that the points in the scene "grabbed" by the
        // controllers follow them.

        const BASIS_POINT_SCALE = 0.01;

        // Create point matches from change in controller position since last
        // frame. Use two points per controller.
        let matches = selectingControllers.reduce((pm, c) => {
          let pairs = [
              [c.userData.lastPosition, c.position],
              [
                c.userData.lastUp.clone()
                    .multiplyScalar(BASIS_POINT_SCALE)
                    .applyQuaternion(c.userData.lastQuaternion)
                    .add(c.userData.lastPosition),
                c.up.clone()
                    .multiplyScalar(BASIS_POINT_SCALE)
                    .applyQuaternion(c.quaternion)
                    .add(c.position)
              ]
          ];
          for (let [v1, v2] of pairs) {
            let p1 = new CATMAID.transform.Point([v1.x, v1.y, v1.z]);
            let p2 = new CATMAID.transform.Point([v2.x, v2.y, v2.z]);

            pm.push(new CATMAID.transform.PointMatch(p1, p2, 1.0));
          }

          return pm;
        }, []);

        let m = new CATMAID.transform.SimilarityModel3D();
        try {
          m.fit(matches, true);
          let mat = new THREE.Matrix4();
          mat.set(
              m.i00, m.i01, m.i02, m.i03,
              m.i10, m.i11, m.i12, m.i13,
              m.i20, m.i21, m.i22, m.i23,
              0, 0, 0, 1
          );

          // Post-multiply this xform to the rig matrix.
          this.rig.matrix.multiply(mat);

          // Scaling sometimes feels underfit at small scales. One could square
          // the scaling rate:
          // let scale = mat.getMaxScaleOnAxis();
          // this.vr.rig.scale.multiplyScalar(scale);

          this.rig.matrix.decompose(
            this.rig.position,
            this.rig.quaternion,
            this.rig.scale);
        } catch (e) {
          // When controllers barely move, the transform can fail to fit the
          // point matches between frames. This is normal, but is logged as this
          // functionality is new and the log can be useful for understanding why
          // some motions fail.
          console.log(e);
        }
      }

      for (let c of selectingControllers) {
        c.userData.lastPosition = c.position.clone();
        c.userData.lastQuaternion = c.quaternion.clone();
        c.userData.lastUp = c.up.clone();
      }

      this.view.space.render();
    }
  }

  WebVRInterface.EVENT_VR_START = Symbol('start');
  WebVRInterface.EVENT_VR_END = Symbol('end');

  CATMAID.WebVRInterface = WebVRInterface;

})(CATMAID);
