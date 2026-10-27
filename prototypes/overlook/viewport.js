const WIDTH = 1600, HEIGHT = 900;

export function fitViewport(width, height) {
  const scale = Math.min(width / WIDTH, height / HEIGHT);
  return { scale, width: width / scale, height: height / scale };
}

export function cameraFrame(width, height, index) {
  // 固定餐馆的像素比例，只将额外画幅用于外围街景。
  const half = (index === 1 ? 9.5 : 11.8) * height / HEIGHT;
  return { left: -half * width / height, right: half * width / height, top: half, bottom: -half };
}
