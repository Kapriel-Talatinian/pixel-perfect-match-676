import { Composition } from "remotion";
import { MaydayVideo, TOTAL_FRAMES } from "./Video";

export const Root = () => (
  <Composition
    id="Mayday"
    component={MaydayVideo}
    durationInFrames={TOTAL_FRAMES}
    fps={30}
    width={1920}
    height={1080}
  />
);
