--[[ TLCVoyageLogDumper
    A UE4SS mod for dumping voyage logs and map locations from the game "Voyage".
    Author: T1K (The1Killer)
    Version: 1.1
    Description: This mod allows you to dump voyage logs and map locations to JSON files for analysis and reference.
    Keybinds:
        - F3: Dump voyage logs to "voyage_logs_dump.json"
        - F2: Dump voyage map locations to "voyage_location_dump.json"
]]

--[[
    Map in-game coordinates (x, y) to map coordinates (longitude, latitude)
    using reference points from voyage_location_dump.json and locations.json.
    This function assumes a linear mapping based on two known reference points.
]]

-- Reference points using NDNS nodes (exact coordinates match their names)
-- NDNS nodes are named by their map coords, so mapping is precise.
local reference_points = {
    -- NDNs Node -10,-2 (GrowthContainer03)
    { x = -104096.06372284, y = -16634.833630295, longitude = -10, latitude = -2 },
    -- NDNs Node 30,-2 (GrowthContainer02)
    { x = 296034.28195185, y = -16646.82228586, longitude = 30, latitude = -2 },
    -- NDNs Node 55,-2 (GrowthContainer01)
    { x = 545611.42042398, y = -16682.757095246, longitude = 55, latitude = -2 },
    -- NDNs Node 84,-2 (GrowthContainer04)
    { x = 845354.16623852, y = -16623.40624054, longitude = 84, latitude = -2 },
    -- NDNs Node 110,-2 (GrowthContainer05)
    { x = 1095476.7723232, y = -16733.820756782, longitude = 110, latitude = -2 },
    -- NDNs Node 150,-2 (GrowthContainer06)
    { x = 1495063.7860711, y = -16926.391849368, longitude = 150, latitude = -2 },
    -- NDNs Node 70,-17 (GrowthContainer07)
    { x = 695606.68111178, y = -166621.95089079, longitude = 70, latitude = -17 },
    -- NDNs Node 70,-42 (GrowthContainer08)
    { x = 695749.95512462, y = -416454.76491902, longitude = 70, latitude = -42 },
    -- NDNs Node 70,-82 (GrowthContainer09)
    { x = 695687.08813581, y = -816572.22171484, longitude = 70, latitude = -82 },
    -- NDNs Node 70,14 (GrowthContainer10)
    { x = 695504.92162631, y = 133264.42817258, longitude = 70, latitude = 14 },
    -- NDNs Node 70,38 (GrowthContainer11)
    { x = 695312.33305742, y = 383013.10447412, longitude = 70, latitude = 38 },
    -- NDNs Node 70,78 (GrowthContainer12)
    { x = 695386.51822651, y = 783130.57702177, longitude = 70, latitude = 78 },
}

-- Calculate linear mapping coefficients for x->longitude and y->latitude
local function compute_linear_map(p1, p2)
    local dx = p2.x - p1.x
    local dy = p2.y - p1.y
    local dlon = p2.longitude - p1.longitude
    local dlat = p2.latitude - p1.latitude
    local scale_x = dlon / dx
    local scale_y = dlat / dy
    local offset_x = p1.longitude - p1.x * scale_x
    local offset_y = p1.latitude - p1.y * scale_y
    return scale_x, offset_x, scale_y, offset_y
end

-- Use two maximally separated NDNS nodes for best accuracy:
-- p1: NDNs Node -10,-2 (leftmost X) for X-axis scale
-- p2: NDNs Node 150,-2 (rightmost X) for X-axis scale
-- p3: NDNs Node 70,-82 (lowest Y) for Y-axis scale
-- p4: NDNs Node 70,78 (highest Y) for Y-axis scale
local p1 = reference_points[1]   -- (-10, -2)
local p2 = reference_points[6]   -- (150, -2)
local p3 = reference_points[9]   -- (70, -82)
local p4 = reference_points[12]  -- (70, 78)

-- Compute X scale from horizontal pair, Y scale from vertical pair
local scale_x = (p2.longitude - p1.longitude) / (p2.x - p1.x)
local offset_x = p1.longitude - p1.x * scale_x
local scale_y = (p4.latitude - p3.latitude) / (p4.y - p3.y)
local offset_y = p3.latitude - p3.y * scale_y

-- Main mapping function
function MapIngameToMapCoords(x, y)
    -- x, y: in-game coordinates
    -- returns: longitude, latitude (map coordinates)
    local longitude = x * scale_x + offset_x
    local latitude = y * scale_y + offset_y
    return longitude, latitude
end

-- Example usage:
-- local lon, lat = MapIngameToMapCoords(887149.48930109, 271982.28465284)
-- print(lon, lat)  -- Should be close to 88, 27
print("[T1KTLCVoyageLogDumper] Mod loaded\n")

require("jsonshim")


local function GetBuildNumber()
    local allText = FindAllOf("TextBlock")
    for _, tb in ipairs(allText) do
        if tb:GetFName():ToString() == "BuildNumberText" and tb:GetFullName():find("PlayingWidget") and tb:GetFullName():find("/Engine") then
            print(string.format("Found BuildNumberText: %s\n", tb:GetFullName()))
            print(string.format("Current build number text: %s\n", tb.Text:ToString()))
            return tb.Text:ToString()
        end
    end
    print("[T1KTLCVoyageLogDumper] BuildNumberText not found\n")
    return nil
end

local function dumpVoyageLogs()
    print("[T1KTLCVoyageLogDumper] Dumping voyage logs...\n")
    local voyageLogs = FindAllOf("VoyageLogData")
    local voyageComponents = FindAllOf("VoyageLogFragment")
    local comps = {}
    local dump = {}
    print(string.format("[T1KTLCVoyageLogDumper] Found %d voyage logs and %d fragments\n", #voyageLogs, #voyageComponents))

    for _, cmp in ipairs(voyageComponents) do
        local path = cmp:GetFullName()
        --split path by . and take last part
        local pathParts = {}
        for part in string.gmatch(path, "[^%.]+") do
            table.insert(pathParts, part)
        end
        path = pathParts[#pathParts]
        --split path by : and make parent first part
        local parent = string.match(path, "([^:]+)")

        table.insert(comps, {
            id = path,
            title = cmp.Name:ToString(),
            description = cmp.Text:ToString(),
            parent = parent,
        })
    end

    for _, log in ipairs(voyageLogs) do
        local logId = log:GetFName():ToString()
        local fragments = {}
        
        -- Find matching fragments for this log
        for _, frag in ipairs(comps) do
            if frag.parent == logId then
                table.insert(fragments, {
                    id = frag.id,
                    title = frag.title,
                    description = frag.description,
                })
            end
        end
        
        table.insert(dump, {
            id = logId,
            title = log.Name:ToString(),
            description = log.Description:ToString(),
            footer = log.DescriptionFooter:ToString(),
            fragments = fragments,
        })
    end

    -- DumpObject(voyageComponents[1])

    local buildNumber = GetBuildNumber() or "unknown"
    local output = { build_number = buildNumber, data = dump }

    local file = io.open("voyage_logs_dump.json", "w")
    if file then
        file:write(toJSON(output, "  ", {"build_number", "data", "id", "title", "description", "footer", "fragments", "parent"}))
        file:close()
        print("[T1KTLCVoyageLogDumper] Voyage logs dumped to voyage_logs_dump.json\n")
    else
        print("[T1KTLCVoyageLogDumper] Failed to open file for writing\n")
    end
end

local function dumpVoyageMapLocations()
    print("[T1KTLCVoyageLogDumper] Dumping voyage map locations...\n")
    local voyageLocations = FindAllOf("VoyageLocation")
    local voyageComponents = FindAllOf("VoyageLocatorComponent")
    local comps = {}
    local dump = {}
    print(string.format("[T1KTLCVoyageLogDumper] Found %d voyage locations and %d components\n", #voyageLocations, #voyageComponents))

    for _, cmp in ipairs(voyageComponents) do
        local path = cmp:GetFullName()
        --split path by . and take last part
        local pathParts = {}
        for part in string.gmatch(path, "[^%.]+") do
            table.insert(pathParts, part)
        end
        path = pathParts[#pathParts-1]
        --split path by : and make parent first part
        -- local parent = string.match(path, "([^:]+)")

        local lon, lat = MapIngameToMapCoords(cmp.RelativeLocation.x, cmp.RelativeLocation.y)

        table.insert(comps, {
            class = path,
            id = cmp.properties.Name:ToString(),
            x = cmp.RelativeLocation.X,
            y = cmp.RelativeLocation.Y,
            z = cmp.RelativeLocation.Z,
            lon = lon,
            lat = lat,
            title = cmp.properties.DisplayName:ToString(),
            group = cmp.properties.Group:ToString(),
            -- description = cmp.Text:ToString(),
            -- parent = parent,
        })
    end

    -- DumpObject(voyageComponents[1])

    local buildNumber = GetBuildNumber() or "unknown"
    local output = { build_number = buildNumber, data = comps }

    local file = io.open("voyage_location_dump.json", "w")
    if file then
        file:write(toJSON(output, "  ", {"build_number", "data", "id", "title", "group", "x", "y", "z", "class"}))
        file:close()
        print("[T1KTLCVoyageLogDumper] Voyage locations dumped to voyage_location_dump.json\n")
    else
        print("[T1KTLCVoyageLogDumper] Failed to open file for writing\n")
    end
end

-- Lookup table mapping BP_Maze_RoomNumber_C instance IDs to their room label and number.
-- Data sourced from voyage_maze_numbers_dump.json.
local maze_room_data = {
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1234426662"] = { room = "B3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1243881663"] = { room = "C3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1247787664"] = { room = "E2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1287405665"] = { room = "G1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1287408666"] = { room = "H1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1314575667"] = { room = "G3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1314579669"] = { room = "E4"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1346505670"] = { room = "C4"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1368127671"] = { room = "E1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1439821676"] = { room = "E3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1447221677"] = { room = "F1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1452373678"] = { room = "D1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1610597680"] = { room = "C1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1610600681"] = { room = "D2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1631718683"] = { room = "C2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1637197684"] = { room = "B1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1648634685"] = { room = "F2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390A3B502_64fd9582c515c2dc_1881279947"] = { room = "B2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390A6B502_64fd9582c515c2dc_1216033503"] = { room = "G2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1314578668"] = { room = "A1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1385192673"] = { room = "A3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1616968682"] = { room = "F3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390A6B502_64fd9582c515c2dc_1950753544"] = { room = "A2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1975299502"] = { room = "X1"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1988757503"] = { room = "X2"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1990989504"] = { room = "X3"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1999012505"] = { room = "X4"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1999015506"] = { room = "X5"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1999016507"] = { room = "X6"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_2000328508"] = { room = "X7"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_2000331509"] = { room = "X8"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_2000333510"] = { room = "X9"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF3904DC002_1bbf791c380ff3a9_1939940165"] = { room = "997"},
    ["BP_Maze_RoomNumber_C_UAID_C87F54CEF390E0B502_64fd9582c515c2dc_1214822351"] = { room = "998"},
}

--- Returns the room label for a given BP_Maze_RoomNumber_C instance ID.
--- @param id string  The full instance ID (last path segment after the final dot)
--- @return string room  e.g. "A1", or nil if not found
local function GetMazeRoomInfo(id)
    local entry = maze_room_data[id]
    if entry then
        return entry.room
    end
    return nil
end

local function dumpVoyageMazeRoomNumbers()
    print("[T1KTLCVoyageLogDumper] Dumping voyage maze room numbers...\n")
    -- local voyageLocations = FindAllOf("VoyageLocation")
    local roomNumbers = FindAllOf("BP_Maze_RoomNumber_C")
    local dump = {}
    print(string.format("[T1KTLCVoyageLogDumper] Found %d room numbers\n", #roomNumbers))

    -- BP_Maze_RoomNumber_C /Game/Maps/VoyageWorld2/_Generated_/5TF4A0F0ZHMO6BIX2MHR52922.VoyageWorld2:PersistentLevel.BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1314578668

    for _, cmp in ipairs(roomNumbers) do
        local path = cmp:GetFullName()
        --split path by . and take last part
        local pathParts = {}
        for part in string.gmatch(path, "[^%.]+") do
            table.insert(pathParts, part)
        end
        local class = pathParts[#pathParts]
        pathParts = {}
        for part in string.gmatch(class, "[^%_]+") do
            table.insert(pathParts, part)
        end
        local id = pathParts[#pathParts]

        local room = GetMazeRoomInfo(class)

        local d = {}
        for i, decal in ipairs({ cmp.Decal_0, cmp.Decal_1, cmp.Decal_2 }) do
            local val = "None"
            if decal and decal.DecalMaterial then
                local matName = decal.DecalMaterial:GetFullName()
                -- print(string.format("Decal %d material: %s", i, matName))
                -- Extract the number from the material name using pattern matching
                val = string.match(matName, "MI_Decal_Number_(%d+)") or val 
            end
            d[i] = val
        end

        table.insert(dump, {
            class = class,
            id = id,
            num = ""..d[1]..d[2]..d[3],
            room = room,
            -- useRandom = cmp.UseRandomNumber,
            -- description = cmp.Text:ToString(),
            -- parent = parent,
        })
    end

    -- DumpObject(voyageComponents[1])

    table.sort(dump, function(a, b)
        local idA = tonumber(a.id) or a.id
        local idB = tonumber(b.id) or b.id
        return idA < idB
    end)

    local buildNumber = GetBuildNumber() or "unknown"
    local output = { build_number = buildNumber, data = dump }

    local file = io.open("voyage_maze_numbers_dump.json", "w")
    if file then
        file:write(toJSON(output, "  ", {"build_number", "data", "id", "num", "room", "class"}))
        file:close()
        print("[T1KTLCVoyageLogDumper] Voyage maze room numbers dumped to voyage_maze_numbers_dump.json\n")
    else
        print("[T1KTLCVoyageLogDumper] Failed to open file for writing\n")
    end
end


--[[
    Sample Data (hologram collectible) dumping.

    VoyageSampleDataAsset uses Unreal's unversioned property serialization, so its
    property names aren't recoverable from the static .uasset/.uexp files (only the
    unversioned VALUES are). The real property names below (UncollectedHeader/
    UncollectedDescription/SentDescription) were confirmed live via UE4SS's
    ForEachProperty reflection.

    dumpVoyageSampleDataImages() doesn't have the property-name problem: the texture
    asset paths were already recovered from the static files
    (/Game/Textures/UI/SampleDatas/...), so it loads each texture directly by path --
    no VoyageSampleDataAsset property access needed. It draws each texture onto a
    small RGBA8 render target via UCanvas:K2_DrawTexture and exports that with
    UKismetRenderingLibrary:ExportRenderTarget, which writes PNG for any
    non-RTF_RGBA16f render target format (confirmed against Epic's
    KismetRenderingLibrary.cpp).
]]

-- Field items are named "DA_SampleData_<n>", cave paintings "DA_SampleData_CavePainting_<n>".
-- Sorts field items first, then cave paintings, each by their numeric id, so the dump
-- has a stable order instead of FindAllOf()'s arbitrary traversal order.
local function sampleDataSortKey(id)
    local caveNum = id:match("^DA_SampleData_CavePainting_(%d+)$")
    if caveNum then
        return 1, tonumber(caveNum)
    end
    return 0, tonumber(id:match("^DA_SampleData_(%d+)$")) or 0
end

local function dumpVoyageSampleDataText()
    print("[T1KTLCVoyageLogDumper] Dumping sample data text...\n")
    local assets = FindAllOf("VoyageSampleDataAsset")
    local dump = {}
    for _, asset in ipairs(assets) do
        table.insert(dump, {
            id = asset:GetFName():ToString(),
            title = asset.UncollectedHeader and asset.UncollectedHeader:ToString() or nil,
            uncollectedDescription = asset.UncollectedDescription and asset.UncollectedDescription:ToString() or nil,
            sentDescription = asset.SentDescription and asset.SentDescription:ToString() or nil,
        })
    end
    table.sort(dump, function(a, b)
        local aCat, aNum = sampleDataSortKey(a.id)
        local bCat, bNum = sampleDataSortKey(b.id)
        if aCat ~= bCat then return aCat < bCat end
        return aNum < bNum
    end)

    local file = io.open("voyage_sampledata_text_dump.json", "w")
    if file then
        file:write(toJSON(dump, "  ", { "id", "title", "uncollectedDescription", "sentDescription" }))
        file:close()
        print("[T1KTLCVoyageLogDumper] Sample data text dumped to voyage_sampledata_text_dump.json\n")
    else
        print("[T1KTLCVoyageLogDumper] Failed to open file for writing\n")
    end
end

-- Draws `texturePath` (loaded by its known /Game/... path) onto an RGBA8 render target
-- sized to the source texture (these are already small, e.g. 256x144) and exports it
-- as `outDir/outName.png`. Returns true on success.
local function exportSampleDataTexture(krl, worldContext, texturePath, outDir, outName)
    -- LoadAsset takes "PackagePath.ObjectName", not just the package path -- without
    -- the ".ObjectName" suffix it silently fails to load anything.
    LoadAsset(texturePath .. "." .. outName)
    local tex = FindObject("Texture2D", outName)
    if not tex or not tex:IsValid() then
        print(string.format("[T1KTLCVoyageLogDumper] Could not load texture %s\n", texturePath))
        return false
    end

    -- Texture2D doesn't reflect SizeX/SizeY as plain properties. "GetSizeX"/"GetSizeY"
    -- are only the Blueprint DisplayName metadata -- the actual reflected UFunctions
    -- (and what UE4SS looks up by) are Blueprint_GetSizeX/Blueprint_GetSizeY.
    local sizeX, sizeY = tex:Blueprint_GetSizeX(), tex:Blueprint_GetSizeY()

    -- ETextureRenderTargetFormat.RTF_RGBA8_SRGB = 3 -- anything but RTF_RGBA16f (6)
    -- makes ExportRenderTarget write PNG instead of HDR/EXR.
    local rt = krl:CreateRenderTarget2D(worldContext, sizeX, sizeY, 3, { R = 0, G = 0, B = 0, A = 0 }, false, false)
    if not rt or not rt:IsValid() then
        print(string.format("[T1KTLCVoyageLogDumper] Failed to create render target for %s\n", texturePath))
        return false
    end

    -- Canvas/Size/Context are Blueprint "out" params -- UE4SS fills the tables we pass
    -- in-place rather than returning them, so each needs its own table.
    local canvasOut, sizeOut, contextOut = {}, {}, {}
    krl:BeginDrawCanvasToRenderTarget(worldContext, rt, canvasOut, sizeOut, contextOut)
    local canvas = canvasOut.Canvas
    if not canvas or not canvas:IsValid() then
        print(string.format("[T1KTLCVoyageLogDumper] Failed to get canvas for %s\n", texturePath))
        return false
    end

    canvas:K2_DrawTexture(
        tex,
        { X = 0, Y = 0 },
        { X = sizeX, Y = sizeY },
        { X = 0, Y = 0 },
        { X = 1, Y = 1 },
        { R = 1, G = 1, B = 1, A = 1 },
        0,   -- EBlendMode.BLEND_Opaque
        0.0, -- Rotation
        { X = 0.5, Y = 0.5 }
    )

    krl:EndDrawCanvasToRenderTarget(worldContext, contextOut)
    krl:ExportRenderTarget(worldContext, rt, outDir, outName .. ".png")
    return true
end

local function dumpVoyageSampleDataImages()
    print("[T1KTLCVoyageLogDumper] Dumping sample data thumbnails...\n")
    local krl = StaticFindObject("/Script/Engine.Default__KismetRenderingLibrary")
    local worldContext = FindFirstOf("PlayerController")
    if not krl or not krl:IsValid() or not worldContext or not worldContext:IsValid() then
        print("[T1KTLCVoyageLogDumper] Could not find KismetRenderingLibrary or PlayerController\n")
        return
    end

    local outDir = "sampledata_images\\"
    local assets = FindAllOf("VoyageSampleDataAsset")
    local ok, total = 0, 0

    for _, asset in ipairs(assets) do
        total = total + 1
        -- Asset names are "DA_SampleData_<id>" or "DA_SampleData_CavePainting_<id>" --
        -- the matching texture lives at the same name minus the "DA_" prefix. Not every
        -- asset has unique art (e.g. "Bed on Wheels" doesn't), so exportSampleDataTexture()
        -- failing to load one is expected and handled gracefully, not an error.
        local name = asset:GetFName():ToString():gsub("^DA_", "")
        if exportSampleDataTexture(krl, worldContext, "/Game/Textures/UI/SampleDatas/" .. name, outDir, name) then
            ok = ok + 1
        end
    end

    print(string.format("[T1KTLCVoyageLogDumper] Exported %d/%d sample data thumbnails to %s\n", ok, total, outDir))
end

-- Register key bind for Control + F3
-- RegisterKeyBind(Key.F3, { ModifierKey.CONTROL }, function()

-- Register key bind for F2
RegisterKeyBind(Key.F2, { }, function()
    ExecuteInGameThread(function()
        dumpVoyageLogs()
        dumpVoyageMapLocations()
    end)
end)

-- Register key bind for F3
RegisterKeyBind(Key.F3, { }, function()
    ExecuteInGameThread(function()
        dumpVoyageMazeRoomNumbers()
    end)
end)

-- Register key bind for F4: export Sample Data hologram thumbnails as PNGs and
-- their title/description text as JSON
RegisterKeyBind(Key.F4, { }, function()
    ExecuteInGameThread(function()
        dumpVoyageSampleDataImages()
        dumpVoyageSampleDataText()
    end)
end)

