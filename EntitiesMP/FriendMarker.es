2022
%{
#include "StdH.h"
%}

uses "EntitiesMP/Marker";

class CFriendMarker: CMarker {
name      "Friend Marker";
thumbnail "Thumbnails\\EnemyMarker.tbn";

properties:
  1 FLOAT m_fWaitTime = 0.0f,     // time to wait(or do anything) until go to another marker
  2 RANGE m_fMarkerRange        "Marker Range" 'M' = 0.0f,  // range around marker (marker doesn't have to be hit directly)

  4 CEntityPointer m_penTrigger "Trigger",

components:
  1 model   MODEL_MARKER     "Models\\Editor\\EnemyMarker.mdl",
  2 texture TEXTURE_MARKER  "Models\\Editor\\CollisionBox.tex",

functions:
  /* Check if entity is moved on a route set up by its targets. */
  BOOL MovesByTargetedRoute(CTString &strTargetProperty) const {
    strTargetProperty = "Target";
    return TRUE;
  };
  
  /* Check if entity can drop marker for making linked route. */
  BOOL DropsMarker(CTFileName &fnmMarkerClass, CTString &strTargetProperty) const {
    fnmMarkerClass = CTFILENAME("Classes\\HemingWW\\FriendMarker.ecl");
    strTargetProperty = "Target";
    return TRUE;
  }

  BOOL IsTargetValid(SLONG slPropertyOffset, CEntity *penTarget)
  {
    if( slPropertyOffset == offsetof(CFriendMarker, m_penTarget))
    {
      return IsOfClass(penTarget, "Friend Marker");
    }   
    return CEntity::IsTargetValid(slPropertyOffset, penTarget);
  }

procedures:
  Main() {
    InitAsEditorModel();
    SetPhysicsFlags(EPF_MODEL_IMMATERIAL);
    SetCollisionFlags(ECF_IMMATERIAL);
    
    if (m_strName=="Marker") {
      m_strName="Friend Marker";
    }

    // set appearance
    SetModel(MODEL_MARKER);
    SetModelMainTexture(TEXTURE_MARKER);
    return;
  }
};

