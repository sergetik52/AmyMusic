import React, { useState, useRef, useEffect, useCallback } from "react";
import { useEscapeKey } from "../utils/useEscapeKey";

export function AvatarCropperModal({ imageSrc, onCrop, onCancel }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);

  const imageRef = useRef(null);
  const canvasRef = useRef(null);

  useEscapeKey(true, onCancel);

  // Load image
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImgLoaded(true);
      // Reset position and scale
      setScale(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Draw canvas preview
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imgLoaded) return;

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Draw background grid/darkness
    ctx.fillStyle = "#0c0c0c";
    ctx.fillRect(0, 0, width, height);

    const aspect = img.width / img.height;
    let drawW = width * scale;
    let drawH = height * scale;

    if (aspect > 1) {
      drawW = drawH * aspect;
    } else {
      drawH = drawW / aspect;
    }

    const centerX = width / 2 + offset.x;
    const centerY = height / 2 + offset.y;
    const drawX = centerX - drawW / 2;
    const drawY = centerY - drawH / 2;

    ctx.save();
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    // Draw circular mask overlay
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.arc(width / 2, height / 2, width / 2 - 16, 0, Math.PI * 2, true);
    ctx.fill();

    // Circle border accent
    ctx.strokeStyle = "#8341EF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, width / 2 - 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }, [imgLoaded, scale, offset]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  // Mouse / Touch handlers for dragging
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setScale((prev) => Math.min(Math.max(0.5, prev + delta), 4));
  };

  const handleSaveCrop = () => {
    const img = imageRef.current;
    if (!img) return;

    // Create high-res export canvas (360x360)
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = 360;
    exportCanvas.height = 360;
    const ctx = exportCanvas.getContext("2d");

    const width = 300; // Preview canvas size
    const height = 300;

    const aspect = img.width / img.height;
    let drawW = width * scale;
    let drawH = height * scale;

    if (aspect > 1) {
      drawW = drawH * aspect;
    } else {
      drawH = drawW / aspect;
    }

    const centerX = width / 2 + offset.x;
    const centerY = height / 2 + offset.y;
    const drawX = centerX - drawW / 2;
    const drawY = centerY - drawH / 2;

    // Crop area is circle inside (16px inset on 300px canvas -> 268px circle)
    const cropSize = width - 32;
    const cropX = 16;
    const cropY = 16;

    // Draw onto export canvas
    ctx.save();
    ctx.drawImage(
      img,
      (cropX - drawX) * (img.width / drawW),
      (cropY - drawY) * (img.height / drawH),
      cropSize * (img.width / drawW),
      cropSize * (img.height / drawH),
      0,
      0,
      360,
      360
    );
    ctx.restore();

    const croppedUrl = exportCanvas.toDataURL("image/jpeg", 0.9);
    onCrop(croppedUrl);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0e0e0e] p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white">Кадрирование аватарки</h3>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-white/50 mb-4">
          Перетаскивайте изображение и используйте ползунок для масштабирования.
        </p>

        {/* Canvas cropper area */}
        <div
          className="relative mx-auto flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black cursor-grab active:cursor-grabbing select-none"
          style={{ width: 300, height: 300 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <canvas ref={canvasRef} width={300} height={300} className="pointer-events-none" />
        </div>

        {/* Zoom controls */}
        <div className="mt-5 flex items-center gap-3 px-2">
          <span className="text-xs font-bold text-white/40">Масштаб</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.05"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="player-seek-slider flex-1"
          />
          <span className="text-xs font-mono font-bold text-[#8341EF] w-10 text-right">
            {Math.round(scale * 100)}%
          </span>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSaveCrop}
            className="flex-1 rounded-xl bg-[#8341EF] hover:bg-[#7232d6] py-2.5 text-xs font-bold text-white shadow-lg transition"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
