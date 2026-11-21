/**
 * Imagem da câmera e, por cima, o desenho das mãos (refs vindos de useHandCamera).
 * Fica dentro do quadro de cada tela (.camera-view, .camera-tool__view...), que define tamanho e espelhamento.
 * Usado por: CameraPage, CameraToolLayout e CameraSignQuestion.
 */
export function CameraFeed({ camera }) {
  return (
    <>
      <video ref={camera.videoRef} playsInline muted aria-label="Imagem da câmera" />
      <canvas ref={camera.canvasRef} aria-hidden="true" />
    </>
  );
}
