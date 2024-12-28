"use client";

import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { Button } from "./components/button";
import { Input } from "./components/input";
import { Slider } from "./components/slider";

// Function to upload image to ImgBB
const uploadToImgBB = async (file: File): Promise<string> => {
  console.log("Uploading image to ImgBB...");
  const formData = new FormData();
  formData.append("image", file);

  try {
    const response = await axios.post(
      "https://api.imgbb.com/1/upload",
      formData,
      {
        params: {
          key: process.env.NEXT_PUBLIC_IMGBB_API_KEY,
        },
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    console.log("ImgBB upload response:", response.data);
    return response.data.data.url;
  } catch (error) {
    console.error("Error uploading to ImgBB:", error);
    throw error;
  }
};

// Function to generate morphing video using Luma Dream Machine API
const generateMorphingVideo = async (
  startImageFile: File,
  endImageFile: File
) => {
  const startImageUrl = await uploadToImgBB(startImageFile);
  const endImageUrl = await uploadToImgBB(endImageFile);

  const options = {
    method: "POST",
    url: "https://api.lumalabs.ai/dream-machine/v1/generations",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_LUMA_API_KEY}`,
    },
    data: {
      prompt: "A runway video transitioning between two images",
      keyframes: {
        frame0: { type: "image", url: startImageUrl },
        frame1: { type: "image", url: endImageUrl },
      },
      aspect_ratio: "16:9",
      loop: false,
    },
  };

  try {
    const response = await axios(
      "https://api.lumalabs.ai/dream-machine/v1/generations",
      options
    );
    console.log("Luma API Response:", response.data);
    return response.data.id; // Return the generation ID
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.error("Luma API Error Response:", error.response.data);
      throw new Error(
        `Luma API Error: ${error.response.status} - ${JSON.stringify(
          error.response.data
        )}`
      );
    } else {
      console.error("Error generating morphing video:", error);
      throw error;
    }
  }
};

// Function to get generation status and video URL
const getGenerationStatus = async (id: string) => {
  const options = {
    method: "GET",
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_LUMA_API_KEY}`,
    },
  };

  try {
    const response = await axios(
      `https://api.lumalabs.ai/dream-machine/v1/generations/${id}`,
      options
    );
    console.log("Luma API Status Response:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error getting generation status:", error);
    throw error;
  }
};

// Function to capture frame from video and return as blob
const captureFrame = (video: HTMLVideoElement): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas
        .getContext("2d")
        ?.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob from canvas"));
          }
        },
        "image/jpeg",
        0.95
      );
    } catch (error) {
      reject(error);
    }
  });
};

const generate3DObject = async (imageBlob: Blob) => {
  try {
    // Upload the image to ImgBB and get the public URL
    console.log("Starting ImgBB upload process...");
    const publicImageUrl = await uploadToImgBB(
      new File([imageBlob], "frame.jpg", { type: "image/jpeg" })
    );
    console.log("Image uploaded to ImgBB. Public URL:", publicImageUrl);

    const headers = {
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_MESHY_API_KEY}`,
      "Content-Type": "application/json",
    };
    const payload = {
      image_url: publicImageUrl,
      enable_pbr: true,
    };

    console.log("Meshy API Request:", {
      ...payload,
      image_url: publicImageUrl,
      enable_pbr: false,
    });
    const createResponse = await axios.post(
      "https://api.meshy.ai/v1/image-to-3d",
      payload,
      { headers }
    );
    console.log("Meshy API Create Response:", createResponse.data);
    const taskId = createResponse.data.result;

    // Poll for task completion
    let taskCompleted = false;
    let modelData;
    while (!taskCompleted) {
      const statusResponse = await axios.get(
        `https://api.meshy.ai/v1/image-to-3d/${taskId}`,
        { headers }
      );
      console.log("Meshy API Status Response:", statusResponse.data);
      const taskStatus = statusResponse.data;

      if (taskStatus.status === "SUCCEEDED") {
        taskCompleted = true;
        modelData = taskStatus;
      } else if (taskStatus.status === "FAILED") {
        throw new Error("3D object generation failed");
      } else {
        // Wait for 5 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    return modelData;
  } catch (error) {
    console.error("Error generating 3D object:", error);
    throw error;
  }
};

export default function Component() {
  const [step, setStep] = useState(1);
  const [startImage, setStartImage] = useState<File | null>(null);
  const [endImage, setEndImage] = useState<File | null>(null);
  const [generationId, setGenerationId] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [object3DData, setObject3DData] = useState<any>(null);
  const [modelUrl, setModelUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleGenerate = async () => {
    if (!startImage || !endImage) {
      console.error("Start and end images are required");
      return;
    }
    setStep(2);
    try {
      const id = await generateMorphingVideo(startImage, endImage);
      setGenerationId(id);
    } catch (error) {
      console.error("Error in handleGenerate:", error);
      // Display error message to the user
      alert(`Failed to generate video: ${error.message}`);
      setStep(1);
    }
  };

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (generationId) {
      intervalId = setInterval(async () => {
        try {
          const status = await getGenerationStatus(generationId);
          if (status.state === "completed") {
            setVideoUrl(status.assets.video);
            setStep(3);
            clearInterval(intervalId);
          } else if (status.state === "failed") {
            console.error("Generation failed:", status.failure_reason);
            setStep(1);
            clearInterval(intervalId);
          }
        } catch (error) {
          console.error("Error checking generation status:", error);
          setStep(1);
          clearInterval(intervalId);
        }
      }, 5000); // Check every 5 seconds
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [generationId]);

  const handleGenerate3D = useCallback(async () => {
    setStep(4);
    try {
      if (!videoRef.current) {
        throw new Error("Video reference is not available");
      }
      const capturedFrameBlob = await captureFrame(videoRef.current);
      console.log("Captured Frame Blob:", capturedFrameBlob);
      const object3D = await generate3DObject(capturedFrameBlob);
      setObject3DData(object3D);
      setModelUrl(object3D.model_urls.glb);
      setStep(5);
    } catch (error) {
      console.error("Error in handleGenerate3D:", error);
      setStep(3);
    }
  }, []);

  useEffect(() => {
    if (step === 5 && canvasRef.current && modelUrl) {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current });
      renderer.setSize(window.innerWidth * 0.75, window.innerHeight * 0.75);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      const loader = new GLTFLoader();
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(modelUrl)}`;
      loader.load(proxyUrl, (gltf) => {
        scene.add(gltf.scene);

        // Center and scale the model
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1 / maxDim;
        gltf.scene.scale.setScalar(scale);
        gltf.scene.position.sub(center.multiplyScalar(scale));

        camera.position.set(0, 0, 5);
        controls.update();
      });

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(0, 1, 0);
      scene.add(directionalLight);

      const animate = () => {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      return () => {
        renderer.dispose();
      };
    }
  }, [step, modelUrl]);

  const handleSliderChange = (value: number[]) => {
    setSelectedFrame(value[0]);
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
    }
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setSelectedFrame(videoRef.current.currentTime);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-grow flex items-center justify-center bg-gray-100">
        {step === 1 && (
          <div className="text-center text-2xl text-gray-500">
            Upload start and end images below to start
          </div>
        )}
        {step === 2 && (
          <div className="text-2xl">Generating morphing video...</div>
        )}
        {step === 3 && (
          <div className="w-full max-h-screen h-full flex items-center justify-center">
            <video
              className="h-full max-h-screen object-contain"
              controls
              src={videoUrl}
              ref={videoRef}
              onTimeUpdate={handleVideoTimeUpdate}
              crossOrigin="anonymous"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        )}
        {step === 4 && <div className="text-2xl">Generating 3D object...</div>}
        {step === 5 && (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <canvas ref={canvasRef} className="w-3/4 h-3/4 mb-4" />
            <div className="w-3/4 bg-gray-200 flex flex-wrap items-center justify-center text-xl p-4">
              <a
                href={object3DData?.model_urls?.glb}
                download
                className="m-2 p-2 bg-blue-500 text-white rounded"
              >
                Download GLB
              </a>
              <a
                href={object3DData?.model_urls?.fbx}
                download
                className="m-2 p-2 bg-blue-500 text-white rounded"
              >
                Download FBX
              </a>
              <a
                href={object3DData?.model_urls?.usdz}
                download
                className="m-2 p-2 bg-blue-500 text-white rounded"
              >
                Download USDZ
              </a>
              <a
                href={object3DData?.thumbnail_url}
                download
                className="m-2 p-2 bg-blue-500 text-white rounded"
              >
                Download Thumbnail
              </a>
              {object3DData?.texture_urls?.map(
                (texture: any, index: number) => (
                  <div key={index} className="flex flex-wrap justify-center">
                    <a
                      href={texture.base_color}
                      download
                      className="m-2 p-2 bg-green-500 text-white rounded"
                    >
                      Base Color
                    </a>
                    <a
                      href={texture.metallic}
                      download
                      className="m-2 p-2 bg-green-500 text-white rounded"
                    >
                      Metallic
                    </a>
                    <a
                      href={texture.normal}
                      download
                      className="m-2 p-2 bg-green-500 text-white rounded"
                    >
                      Normal
                    </a>
                    <a
                      href={texture.roughness}
                      download
                      className="m-2 p-2 bg-green-500 text-white rounded"
                    >
                      Roughness
                    </a>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>
      <div className="fixed bottom-0 w-full bg-white p-4 shadow-md">
        <div className="flex space-x-4 items-center">
          {step === 1 && (
            <>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setStartImage(e.target.files?.[0] || null)}
                className="flex-grow"
              />
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setEndImage(e.target.files?.[0] || null)}
                className="flex-grow"
              />
              <Button variant="outline" onClick={handleGenerate}>
                Generate Video
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <div className="flex-grow flex items-center space-x-2">
                <Slider
                  min={0}
                  max={videoRef.current ? videoRef.current.duration : 10}
                  step={0.1}
                  value={[selectedFrame]}
                  onValueChange={handleSliderChange}
                  className="flex-grow"
                />
                <span className="text-sm text-gray-500">
                  {selectedFrame.toFixed(1)}s
                </span>
              </div>
              <Button onClick={handleGenerate3D}>Generate 3D</Button>
            </>
          )}
          {step === 5 && (
            <Button onClick={() => setStep(1)} className="ml-auto">
              Start Over
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
