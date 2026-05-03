#define _GNU_SOURCE

#include <errno.h>
#include <libgen.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

typedef struct {
  char *argv0;
  char *target;
} launch_target_t;

static void die(const char *message) {
  fprintf(stderr, "LMFD AppImage shim: %s\n", message);
  exit(1);
}

static void die_errno(const char *message) {
  fprintf(stderr, "LMFD AppImage shim: %s: %s\n", message, strerror(errno));
  exit(1);
}

static char *xstrdup(const char *value) {
  char *copy = strdup(value);
  if (copy == NULL) {
    die_errno("out of memory");
  }
  return copy;
}

static char *make_absolute_path(const char *path) {
  if (path == NULL || path[0] == '\0') {
    die("missing argv[0]");
  }

  if (path[0] == '/') {
    return xstrdup(path);
  }

  char cwd[PATH_MAX];
  if (getcwd(cwd, sizeof(cwd)) == NULL) {
    die_errno("failed to resolve current working directory");
  }

  size_t size = strlen(cwd) + 1 + strlen(path) + 1;
  char *absolute = malloc(size);
  if (absolute == NULL) {
    die_errno("out of memory");
  }

  snprintf(absolute, size, "%s/%s", cwd, path);
  return absolute;
}

static char *realpath_or_die(const char *path) {
  char *resolved = realpath(path, NULL);
  if (resolved == NULL) {
    die_errno("failed to resolve wrapper path");
  }
  return resolved;
}

static char *parent_dir(const char *path) {
  char *mutable = xstrdup(path);
  char *dir = dirname(mutable);
  char *copy = xstrdup(dir);
  free(mutable);
  return copy;
}

static char *base_name(const char *path) {
  char *mutable = xstrdup(path);
  char *name = basename(mutable);
  char *copy = xstrdup(name);
  free(mutable);
  return copy;
}

static char *join_path(const char *left, const char *right) {
  size_t size = strlen(left) + 1 + strlen(right) + 1;
  char *joined = malloc(size);
  if (joined == NULL) {
    die_errno("out of memory");
  }

  snprintf(joined, size, "%s/%s", left, right);
  return joined;
}

static char *append_suffix(const char *left, const char *suffix) {
  size_t size = strlen(left) + strlen(suffix) + 1;
  char *joined = malloc(size);
  if (joined == NULL) {
    die_errno("out of memory");
  }

  snprintf(joined, size, "%s%s", left, suffix);
  return joined;
}

static void append_path(char **value, const char *segment) {
  if (segment == NULL || segment[0] == '\0') {
    return;
  }

  if (*value == NULL) {
    *value = xstrdup(segment);
    return;
  }

  size_t existing_len = strlen(*value);
  size_t size = existing_len + 1 + strlen(segment) + 1;
  char *expanded = realloc(*value, size);
  if (expanded == NULL) {
    die_errno("out of memory");
  }

  snprintf(expanded + existing_len, size - existing_len, ":%s", segment);
  *value = expanded;
}

static int path_exists(const char *path) {
  return access(path, F_OK) == 0;
}

static int path_is_directory(const char *path) {
  struct stat st;
  return stat(path, &st) == 0 && S_ISDIR(st.st_mode);
}

static int path_is_executable(const char *path) {
  return access(path, X_OK) == 0;
}

static char *find_app_dir(const char *self_path) {
  char *current = parent_dir(self_path);

  while (strcmp(current, "/") != 0) {
    char *lib_dir = join_path(current, "lib");
    char *sharun_path = join_path(current, "sharun");
    if (path_is_directory(lib_dir) && path_exists(sharun_path)) {
      free(lib_dir);
      free(sharun_path);
      return current;
    }
    free(lib_dir);
    free(sharun_path);

    char *next = parent_dir(current);
    free(current);
    current = next;
  }

  free(current);
  die("could not locate AppDir root");
  return NULL;
}

static char *find_loader(const char *lib_dir) {
  const char *candidates[] = {
      "ld-linux-x86-64.so.2",
      "ld-linux-aarch64.so.1",
      "ld-linux.so.2",
      "ld-musl-x86_64.so.1",
      "ld-musl-aarch64.so.1",
      NULL,
  };

  for (size_t i = 0; candidates[i] != NULL; i++) {
    char *candidate = join_path(lib_dir, candidates[i]);
    if (path_exists(candidate)) {
      return candidate;
    }
    free(candidate);
  }

  die("could not locate bundled dynamic loader");
  return NULL;
}

static void append_lib_path_file(char **lib_path, const char *lib_dir) {
  char *lib_path_file = join_path(lib_dir, "lib.path");
  FILE *file = fopen(lib_path_file, "r");
  free(lib_path_file);

  if (file == NULL) {
    return;
  }

  char line[PATH_MAX];
  while (fgets(line, sizeof(line), file) != NULL) {
    if (line[0] != '+') {
      continue;
    }

    size_t len = strlen(line);
    while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r')) {
      line[--len] = '\0';
    }

    if (len <= 1) {
      continue;
    }

    char *extra_path = malloc(strlen(lib_dir) + strlen(line) + 1);
    if (extra_path == NULL) {
      die_errno("out of memory");
    }

    snprintf(extra_path, strlen(lib_dir) + strlen(line) + 1, "%s%s", lib_dir, line + 1);
    append_path(lib_path, extra_path);
    free(extra_path);
  }

  fclose(file);
}

static void prepend_bin_path(const char *bin_dir) {
  const char *existing = getenv("PATH");
  size_t size = strlen(bin_dir) + 1 + (existing ? strlen(existing) : 0) + 1;
  char *value = malloc(size);
  if (value == NULL) {
    die_errno("out of memory");
  }

  if (existing && existing[0] != '\0') {
    snprintf(value, size, "%s:%s", bin_dir, existing);
  } else {
    snprintf(value, size, "%s", bin_dir);
  }

  if (setenv("PATH", value, 1) != 0) {
    free(value);
    die_errno("failed to update PATH");
  }

  free(value);
}

static launch_target_t resolve_launch_target(
    const char *app_dir,
    const char *self_path,
    const char *self_name) {
  launch_target_t target = {0};

  char *real_sidecar = append_suffix(self_path, ".lmfd-real");
  if (path_is_executable(real_sidecar)) {
    target.target = real_sidecar;
    target.argv0 = xstrdup(self_path);
    return target;
  }
  free(real_sidecar);

  char *shared_bin_dir = join_path(app_dir, "shared/bin");
  char *shared_target = join_path(shared_bin_dir, self_name);
  free(shared_bin_dir);
  if (path_is_executable(shared_target)) {
    char *bin_dir = join_path(app_dir, "bin");
    target.target = shared_target;
    target.argv0 = join_path(bin_dir, self_name);
    free(bin_dir);
    return target;
  }
  free(shared_target);

  char *bin_dir = join_path(app_dir, "bin");
  char *bin_target = join_path(bin_dir, self_name);
  free(bin_dir);
  if (path_is_executable(bin_target) && strcmp(bin_target, self_path) != 0) {
    target.target = bin_target;
    target.argv0 = xstrdup(self_path);
    return target;
  }
  free(bin_target);

  die("could not resolve wrapped target binary");
  return target;
}

int main(int argc, char **argv) {
  char *self_arg = make_absolute_path(argv[0]);
  char *self_path = realpath_or_die(self_arg);
  free(self_arg);

  char *self_name = base_name(self_path);
  char *self_dir = parent_dir(self_path);
  char *app_dir = find_app_dir(self_path);
  char *bin_dir = join_path(app_dir, "bin");
  char *shared_dir = join_path(app_dir, "shared/bin");
  char *lib_dir = join_path(app_dir, "lib");
  char *loader = find_loader(lib_dir);
  launch_target_t target = resolve_launch_target(app_dir, self_path, self_name);

  char *lib_path = NULL;
  append_path(&lib_path, self_dir);
  append_path(&lib_path, bin_dir);
  append_path(&lib_path, shared_dir);
  append_path(&lib_path, lib_dir);
  append_lib_path_file(&lib_path, lib_dir);

  unsetenv("GTK_MODULES");
  unsetenv("GIO_EXTRA_MODULES");

  char *gio_modules_dir = join_path(lib_dir, "gio/modules");
  setenv("GIO_MODULE_DIR", gio_modules_dir, 1);
  setenv("SHARUN_ALLOW_LD_PRELOAD", "1", 1);
  prepend_bin_path(bin_dir);

  char **exec_argv = calloc((size_t)argc + 6, sizeof(char *));
  if (exec_argv == NULL) {
    die_errno("out of memory");
  }

  exec_argv[0] = loader;
  exec_argv[1] = "--argv0";
  exec_argv[2] = target.argv0;
  exec_argv[3] = "--library-path";
  exec_argv[4] = lib_path;
  exec_argv[5] = target.target;
  for (int i = 1; i < argc; i++) {
    exec_argv[i + 5] = argv[i];
  }

  execv(loader, exec_argv);
  die_errno("failed to exec bundled loader");
  return 1;
}
