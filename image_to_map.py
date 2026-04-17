from PIL import Image, ImageTk
import tkinter as tk
from tkinter import ttk
import numpy as np

PATH_IN = "input.png"
PATH_OUT = "map_output.png"

COLORS = {
	"water": (18, 15, 34),
	"plain": (140, 170, 88),
	"highland": (176, 159, 114),
	"mountain": (190, 190, 190)
}

img_np = np.array(Image.open(PATH_IN).convert("RGB")).astype(np.float32) / 255.0

def process_image(thresholds):
	br = img_np.mean(axis=2)

	if INVERT_BRIGHTNESS.get():
		br = 1 - br

	out = np.zeros((*br.shape, 3), dtype=np.uint8)
	w, p, h = thresholds["water"], thresholds["plain"], thresholds["highland"]

	out[br <= w] = COLORS["water"]
	out[(br > w) & (br <= p)] = COLORS["plain"]
	out[(br > p) & (br <= h)] = COLORS["highland"]
	out[br > h] = COLORS["mountain"]

	return Image.fromarray(out)

root = tk.Tk()
root.title("Map Generator")

INVERT_BRIGHTNESS = tk.BooleanVar(master=root, value=False)

thresholds = {
	"water": tk.DoubleVar(value=0.4),
	"plain": tk.DoubleVar(value=0.72),
	"highland": tk.DoubleVar(value=0.85),
}

preview_label = tk.Label(root)

def upd_view(*args):
	current = {k: round(v.get(), 2) for k, v in thresholds.items()}

	if current["water"] > current["plain"]:
		current["plain"] = current["water"]

	if current["plain"] > current["highland"]:
		current["highland"] = current["plain"]

	for k, v in current.items():
		thresholds[k].set(v)

	out_img = process_image(current)

	preview = out_img.copy()
	preview.thumbnail((600, 600))

	tk_img = ImageTk.PhotoImage(preview)
	preview_label.config(image=tk_img)
	preview_label.image = tk_img

	root.current_output = out_img

for i, key in enumerate(["water", "plain", "highland"]):
	ttk.Label(root, text=f"{key.capitalize()}<=", width=11, anchor="w").grid(
		row=i, column=0, padx=3, pady=1, sticky="w"
	)

	ttk.Scale(root, from_=0, to=1, variable=thresholds[key], command=upd_view).grid(
		row=i, column=1, padx=3, pady=1, sticky="ew"
	)

	ttk.Label(root, textvariable=thresholds[key], width=5, anchor="e").grid(
		row=i, column=2, padx=3, pady=1, sticky="e"
	)

preview_label.grid(row=0, column=3, rowspan=6, padx=3, pady=1)

ttk.Checkbutton(root, text="Invert Brightness", variable=INVERT_BRIGHTNESS, command=upd_view).grid(
	row=3, column=0, columnspan=3, pady=1
)

def save_image():
	if hasattr(root, "current_output"):
		root.current_output.save(PATH_OUT)
		print(f"Saved to {PATH_OUT}")

ttk.Button(root, text="SAVE", command=save_image).grid(row=5, column=0, columnspan=3, pady=1)

root.columnconfigure(1, weight=1)
upd_view()
root.mainloop()
