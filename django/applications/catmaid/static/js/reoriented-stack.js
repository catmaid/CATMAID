(function (CATMAID) {

  "use strict";

  const ORIENT_PERMS = [
    /*CATMAID.Stack.ORIENTATION_XY:*/ [
      /*CATMAID.Stack.ORIENTATION_XY:*/ [0, 1, 2],
      /*CATMAID.Stack.ORIENTATION_XZ:*/ [0, 2, 1],
      /*CATMAID.Stack.ORIENTATION_ZY:*/ [2, 1, 0],
    ],
    /*CATMAID.Stack.ORIENTATION_XZ:*/ [
      /*CATMAID.Stack.ORIENTATION_XY:*/ [0, 2, 1],
      /*CATMAID.Stack.ORIENTATION_XZ:*/ [0, 1, 2],
      /*CATMAID.Stack.ORIENTATION_ZY:*/ [1, 2, 0],
    ],
    /*CATMAID.Stack.ORIENTATION_ZY:*/ [
      /*CATMAID.Stack.ORIENTATION_XY:*/ [2, 1, 0],
      /*CATMAID.Stack.ORIENTATION_XZ:*/ [2, 0, 1],
      /*CATMAID.Stack.ORIENTATION_ZY:*/ [0, 1, 2],
    ],
  ];

  CATMAID.ReorientedStack = class ReorientedStack extends CATMAID.Stack {
    constructor(baseStack, orientation) {
      let selfToBasePerm = ORIENT_PERMS[orientation][baseStack.orientation];
      let baseToSelfPerm = ORIENT_PERMS[baseStack.orientation][orientation];

      let imageBlockMirrors = baseStack.imageBlockMirrors();

      let permDownsampleFactors = baseStack.downsample_factors.map(
          zl => CATMAID.tools.permuteCoord(zl, baseToSelfPerm));

      super(
          baseStack.id,
          baseStack.title,
          CATMAID.tools.permuteCoord(baseStack.dimension, baseToSelfPerm),
          CATMAID.tools.permuteCoord(baseStack.resolution, baseToSelfPerm),
          CATMAID.tools.permuteCoord(baseStack.translation, baseToSelfPerm),
          [], // No broken sections
          permDownsampleFactors,
          baseStack.MIN_S,
          baseStack.comment,
          baseStack.description,
          baseStack.metadata,
          orientation,
          CATMAID.tools.permuteCoord(baseStack.canaryLocation, baseToSelfPerm),
          baseStack.placeholderColor,
          imageBlockMirrors
        );

      this.selfToBasePerm = selfToBasePerm;
      this.baseToSelfPerm = baseToSelfPerm;
    }

    encodedId() {
      return CATMAID.Stack.encodeReorientedID(this.id, this.orientation);
    }
  };

})(CATMAID);
