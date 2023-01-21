2019
%{
#include "StdH.h"
#include "ModelHolder2.h"
%}

class CVisualTimer: CRationalEntity {
name      "VisualTimer";
thumbnail "Thumbnails\\VisualTimer.tbn";
features  "HasName", "IsTargetable";

properties:

  1 CTString m_strName          "Name" 'N' = "VisualTimer",
  2 INDEX m_iCountFrom "Count start" 'A' = 100,
  3 FLOAT m_iCount = -1,
  4 CEntityPointer m_penTarget001  "Target001" COLOR(C_GREEN|0xFF),
  5 CEntityPointer m_penTarget010  "Target010" COLOR(C_GREEN|0xFF),
  6 CEntityPointer m_penTarget100  "Target100" COLOR(C_GREEN|0xFF),

components:

  1 model   MODEL_MARKER     "Models\\Editor\\Axis.mdl",
  2 texture TEXTURE_MARKER   "Models\\Editor\\Vector.tex"


functions:

  void StartCounting(void)
  {
    m_iCount = _pTimer->GetLerpedCurrentTick() + m_iCountFrom;
    UpdateCounter();
  }
  void CountOne(void)
  {
    if (m_iCount>0) {
      m_iCount-=1;
      UpdateCounter();
    }
  }
  void StopCounting(void)
  {
    m_iCount = 0;
    UpdateCounter();
  }

  void UpdateCounter(void)
  {

    INDEX iDigitsCount = 0;
    CModelHolder2* m_penModelHolder001;
    if (m_penTarget001 != NULL) { m_penModelHolder001 = ((CModelHolder2*)&*m_penTarget001); iDigitsCount++; }
    CModelHolder2* m_penModelHolder010;
    if (m_penTarget010 != NULL) { m_penModelHolder010 = ((CModelHolder2*)&*m_penTarget010); iDigitsCount++; }
    CModelHolder2* m_penModelHolder100;
    if (m_penTarget100 != NULL) { m_penModelHolder100 = ((CModelHolder2*)&*m_penTarget100); iDigitsCount++; }
    
    for (INDEX i = 0; i < iDigitsCount; i++) {
        int multiplier = pow(10, i);
        INDEX time = abs(m_iCount - _pTimer->GetLerpedCurrentTick());
        if (m_iCount == 0) { time = 0; }
        INDEX iNum = (time % (10*multiplier)) / multiplier;

        switch (i) {
          case 0: m_penModelHolder001->GetModelObject()->mo_toTexture.PlayAnim(iNum, 0); break;
          case 1: m_penModelHolder010->GetModelObject()->mo_toTexture.PlayAnim(iNum, 0); break;
          case 2: m_penModelHolder100->GetModelObject()->mo_toTexture.PlayAnim(iNum, 0); break;
        }
    }

  }
  
procedures:

 /************************************************************
 *                       M  A  I  N                         *
 ************************************************************/

  Update() {

    while (TRUE) {
      UpdateCounter();
      if (m_iCount < _pTimer->GetLerpedCurrentTick()) { 
        return EReturn();
      }
      autowait(0.1f);
    }
  }

  Main()
  {
    InitAsEditorModel();
    SetPhysicsFlags(EPF_MODEL_IMMATERIAL);
    SetCollisionFlags(ECF_IMMATERIAL);

    // set appearance
    SetModel(MODEL_MARKER);
    SetModelMainTexture(TEXTURE_MARKER);

    wait() {
      on(EBegin): {
        resume;
      }
      // when started
      on (EStart): {
        StartCounting();
        call Update();
        resume;
      }
      // when stopped
      on (EStop): {
        StopCounting();
        resume;
      }
    } 
    return;
  }
};