# PowerShell script to show Windows File Explorer dialog for folder selection
# This opens the EXACT same dialog as Windows Explorer (with sidebar, navigation, etc.)
# Returns the selected folder path or empty string if cancelled

# Use the FileOpenDialog COM interface - this is the REAL Windows Explorer dialog!
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class FolderSelectDialog {
    [DllImport("shell32.dll")]
    public static extern int SHILCreateFromPath([MarshalAs(UnmanagedType.LPWStr)] string pszPath, out IntPtr ppIdl, ref uint rgflnOut);

    [DllImport("shell32.dll")]
    public static extern void SHParseDisplayName([MarshalAs(UnmanagedType.LPWStr)] string pszName, IntPtr pbc, out IntPtr ppidl, uint sfgaoIn, out uint psfgaoOut);

    [DllImport("user32.dll")]
    public static extern IntPtr GetActiveWindow();

    [ComImport]
    [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    public class FileOpenDialogInternal { }

    [ComImport]
    [Guid("42f85136-db7e-439c-85f1-e4075d135fc8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IFileOpenDialog {
        [PreserveSig] int Show([In] IntPtr parent);
        void SetFileTypes([In] uint cFileTypes, [In] IntPtr rgFilterSpec);
        void SetFileTypeIndex([In] uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise([In, MarshalAs(UnmanagedType.Interface)] IntPtr pfde, out uint pdwCookie);
        void Unadvise([In] uint dwCookie);
        void SetOptions([In] uint fos);
        void GetOptions(out uint pfos);
        void SetDefaultFolder([In, MarshalAs(UnmanagedType.Interface)] IShellItem psi);
        void SetFolder([In, MarshalAs(UnmanagedType.Interface)] IShellItem psi);
        void GetFolder([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
        void GetCurrentSelection([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
        void SetFileName([In, MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([In, MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
        void AddPlace([In, MarshalAs(UnmanagedType.Interface)] IShellItem psi, int alignment);
        void SetDefaultExtension([In, MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close([MarshalAs(UnmanagedType.Error)] int hr);
        void SetClientGuid([In] ref Guid guid);
        void ClearClientData();
        void SetFilter([MarshalAs(UnmanagedType.Interface)] IntPtr pFilter);
    }

    [ComImport]
    [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItem {
        void BindToHandler([In, MarshalAs(UnmanagedType.Interface)] IntPtr pbc, [In] ref Guid bhid, [In] ref Guid riid, out IntPtr ppv);
        void GetParent([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
        void GetDisplayName([In] uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes([In] uint sfgaoMask, out uint psfgaoAttribs);
        void Compare([In, MarshalAs(UnmanagedType.Interface)] IShellItem psi, [In] uint hint, out int piOrder);
    }

    public static string ShowDialog(string initialDirectory) {
        var dialog = (IFileOpenDialog)new FileOpenDialogInternal();

        try {
            // FOS_PICKFOLDERS = 0x20 (pick folders not files)
            // FOS_FORCEFILESYSTEM = 0x40 (ensure filesystem items only)
            // FOS_PATHMUSTEXIST = 0x800 (path must exist)
            dialog.SetOptions(0x20 | 0x40 | 0x800);
            dialog.SetTitle("Select a Folder");

            // Set initial directory if provided
            if (!string.IsNullOrEmpty(initialDirectory) && System.IO.Directory.Exists(initialDirectory)) {
                IntPtr idl;
                uint atts = 0;
                if (SHILCreateFromPath(initialDirectory, out idl, ref atts) == 0) {
                    IShellItem item;
                    if (SHCreateShellItem(IntPtr.Zero, IntPtr.Zero, idl, out item) == 0) {
                        dialog.SetFolder(item);
                        Marshal.ReleaseComObject(item);
                    }
                    Marshal.FreeCoTaskMem(idl);
                }
            }

            // Show the dialog
            IntPtr hwnd = GetActiveWindow();
            int hr = dialog.Show(hwnd);

            if (hr == 0) {
                IShellItem item;
                dialog.GetResult(out item);
                string path;
                item.GetDisplayName(0x80058000, out path); // SIGDN_FILESYSPATH
                Marshal.ReleaseComObject(item);
                return path;
            }

            return "";
        } finally {
            Marshal.ReleaseComObject(dialog);
        }
    }

    [DllImport("shell32.dll")]
    private static extern int SHCreateShellItem(IntPtr pidlParent, IntPtr psfParent, IntPtr pidl, out IShellItem ppsi);
}
'@

# Get initial directory from argument
$initialDir = ""
if ($args.Count -gt 0) {
    $initialDir = $args[0]
}

# Show the native Windows File Explorer folder picker
$selectedPath = [FolderSelectDialog]::ShowDialog($initialDir)

# Output the result
Write-Output $selectedPath
