import React, { useRef, useEffect } from 'react';
import { View } from 'react-native';

export default function RTCView({ streamURL, style, objectFit, mirror }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && streamURL) {
      // In our web shim, streamURL is actually the MediaStream object itself
      // because we passed localStream.toURL() in CallScreen but on web there is no toURL() typically, 
      // or we can make toURL() return the stream itself.
      // Wait, let's just use srcObject directly.
      videoRef.current.srcObject = streamURL;
    }
  }, [streamURL]);

  return (
    <View style={style}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={mirror} // Usually local video is mirrored and muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: objectFit || 'cover',
          transform: mirror ? 'scaleX(-1)' : 'none'
        }}
      />
    </View>
  );
}
