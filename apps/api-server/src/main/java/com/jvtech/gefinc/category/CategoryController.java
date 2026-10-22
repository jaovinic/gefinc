package com.jvtech.gefinc.category;

import com.jvtech.gefinc.common.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/categories")
public class CategoryController {

  public record CategoryInput(
      @NotBlank(message = "Informe o nome.") @Size(max = 60, message = "Nome muito longo.")
          String name,
      @NotNull(message = "Informe o tipo.") CategoryType type,
      @NotNull(message = "Informe a cor.")
          @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Use uma cor no formato #RRGGBB.")
          String colorHex) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "CategoryInput[REDACTED]";
    }
  }

  public record CategoryResponse(long id, String name, CategoryType type, String colorHex) {
    static CategoryResponse of(Category c) {
      return new CategoryResponse(c.getId(), c.getName(), c.getType(), c.getColorHex());
    }
  }

  private final CategoryService service;

  public CategoryController(CategoryService service) {
    this.service = service;
  }

  @GetMapping
  public List<CategoryResponse> list(@RequestParam(required = false) CategoryType type) {
    return service.list(CurrentUser.id(), type).stream().map(CategoryResponse::of).toList();
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public CategoryResponse create(@Valid @RequestBody CategoryInput body) {
    return CategoryResponse.of(
        service.create(CurrentUser.id(), body.name(), body.type(), body.colorHex()));
  }

  @PutMapping("/{id}")
  public CategoryResponse update(@PathVariable long id, @Valid @RequestBody CategoryInput body) {
    return CategoryResponse.of(
        service.update(CurrentUser.id(), id, body.name(), body.type(), body.colorHex()));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable long id, @RequestParam(required = false) Long reassignTo) {
    service.delete(CurrentUser.id(), id, reassignTo);
  }
}
