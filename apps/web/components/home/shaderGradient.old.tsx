"use client"

import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react"

export function ShaderGradientBackground() {
  return (
    <div className="fixed top-0 min-h-screen w-full overflow-hidden">
      <div
        className="absolute top-0 left-0 right-0 h-[300px] z-[1] pointer-events-none bg-gradient-to-t from-transparent to-background/60"
      />
      <div className="absolute inset-0 -z-10">
        <div className="w-full h-screen pointer-events-none">
          <ShaderGradientCanvas
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <ShaderGradient
              control="query"
              urlString="https://shadergradient.co/customize?animate=on&axesHelper=off&brightness=0.8&cAzimuthAngle=270&cDistance=0.5&cPolarAngle=180&cameraZoom=15.1&color1=%2373bfc4&color2=%23ff810a&color3=%238da0ce&destination=onCanvas&embedMode=off&envPreset=city&format=gif&fov=45&frameRate=10&gizmoHelper=hide&grain=on&lightType=env&pixelDensity=1&positionX=-0.1&positionY=0&positionZ=0&range=disabled&rangeEnd=40&rangeStart=0&reflection=0.4&rotationX=0&rotationY=130&rotationZ=70&shader=defaults&type=sphere&uAmplitude=3.2&uDensity=0.8&uFrequency=5.5&uSpeed=0.3&uStrength=0.3&uTime=0&wireframe=false"
            />
          </ShaderGradientCanvas>
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 h-[400px] z-[1] pointer-events-none bg-gradient-to-b from-transparent to-background"
      />
    </div>
  )
}
