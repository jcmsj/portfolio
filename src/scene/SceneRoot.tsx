import { Ground } from './Ground'
import { Zones } from './Zones'
import { Plaza } from './Plaza'
import { Buildings } from './Buildings'
import { Props } from './Props'
import { Clouds } from './Clouds'
import { CameraRig } from './CameraRig'
import { WalkControls } from './WalkControls'
import { DevCoords } from './DevCoords'

/**
 * The assembled city: island, districts + roads, plaza, buildings, props,
 * clouds, and the camera / walk rigs. Rendered inside CityCanvas' Suspense.
 */
export function SceneRoot() {
  return (
    <group>
      <Ground />
      <Zones />
      <Plaza />
      <Buildings />
      <Props />
      <Clouds />
      {/* Rig order matters: CameraRig parks the orbit camera before
          WalkControls claims it on mode switches. */}
      <CameraRig />
      <WalkControls />
      <DevCoords />
    </group>
  )
}
