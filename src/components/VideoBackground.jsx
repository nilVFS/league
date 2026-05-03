import { heroVideo } from "../assets/media";

function VideoBackground() {
  return (
    <>
      <div className="video-background" aria-hidden="true">
        <video autoPlay loop muted playsInline>
          <source src={heroVideo} type="video/mp4" />
        </video>
      </div>
      <div className="video-background__overlay" aria-hidden="true" />
    </>
  );
}

export default VideoBackground;
